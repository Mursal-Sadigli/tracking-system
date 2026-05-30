const cases = require('./cases');
const { emitCaseEvent } = require('./events');
const mission = require('./mission');
const { checkGeofencesForPoint } = require('./geofence');
const { store } = require('./store');
const { updateSubjectPosition } = require('./intel');
const { logConsent } = require('./compliance');
const { pool, DB_ENABLED } = require('./db');
const visits = require('./visits');
const { lookupIp } = require('./ipLookup');
const { detectAnomalies } = require('./anomalyDetector');
const { maybeUpdateRisk } = require('./riskService');
const { getRulesForCase } = require('./anomalyRules');
const { broadcastSubjectPresence } = require('./areaWatchWorker');
const { resolveLocationWithPython, pickClientIpForResolve } = require('./locationResolve');
const subjectIntel = require('./subjectIntel');

const geofenceStateByDevice = new Map();
const missionDwellByCase = new Map();
const lastDeviationAlert = new Map();
const lastAnomalyEmit = new Map();

function getClientIp(socket) {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
    return String(socket.handshake.address || '').replace('::ffff:', '');
}

function attachSocketHandlers(io, { activeDevices, deviceHistory, toKmh, triggerBriefing }) {
    io.on('connection', async (socket) => {
        console.log('🔌 Client connected:', socket.id);

        const clientIp = getClientIp(socket);
        const ipInfo = await lookupIp(clientIp);
        socket.clientIp = clientIp;
        socket.ipInfo = ipInfo;

        visits.startVisit(socket.id, {
            ip: clientIp,
            city: ipInfo.city,
            country: ipInfo.country,
            isp: ipInfo.isp,
            org: ipInfo.org,
            user_agent: socket.handshake.headers['user-agent'] || ''
        });

        socket.emit('active_devices', Array.from(activeDevices.entries()).map(([id, data]) => ({
            device_id: id,
            ...data
        })));

        socket.emit('connection_info', {
            ip: clientIp,
            isp: ipInfo.isp,
            org: ipInfo.org,
            city: ipInfo.city,
            country: ipInfo.country,
            mobile_network: ipInfo.mobile
        });

        socket.on('register_subject', async (data) => {
            const token = data?.subject_token;
            if (!token) return;
            const c = cases.getCaseByToken(token);
            if (!c) {
                socket.emit('subject_register_error', { error: 'invalid_token' });
                return;
            }
            socket.subjectCaseId = c.case_id;
            socket.subjectDeviceId = c.device_id;
            socket.join(`case:${c.case_id}`);

            visits.markConsent(socket.id);
            const v = visits.activeVisits.get(socket.id);
            if (v) {
                v.case_id = c.case_id;
                v.subject_token = token;
                v.device_type = data?.device_meta?.device_type;
                v.browser = data?.device_meta?.browser;
            }

            await logConsent({
                case_id: c.case_id,
                subject_token: token,
                ip: clientIp,
                user_agent: socket.handshake.headers['user-agent'],
                consent_text: data?.consent_text
            });

            await emitCaseEvent(io, {
                type: 'consent_granted',
                case_id: c.case_id,
                device_id: c.device_id,
                payload: { title: c.title, ip: clientIp, isp: ipInfo.isp }
            });

            socket.emit('subject_registered', {
                case_id: c.case_id,
                device_id: c.device_id,
                title: c.title
            });
        });

        socket.on('subject_intel_snapshot', (data) => {
            const snapshot = data?.snapshot;
            if (!snapshot || typeof snapshot !== 'object') return;

            const token = data?.subject_token || null;
            let caseId = socket.subjectCaseId || null;
            if (!caseId && token) {
                const c = cases.getCaseByToken(token);
                caseId = c?.case_id || null;
            }

            const visit = visits.activeVisits.get(socket.id);
            subjectIntel.attachToVisit(visit, snapshot, socket.ipInfo);

            const entry = subjectIntel.recordSnapshot({
                caseId,
                subjectToken: token,
                socketId: socket.id,
                snapshot,
                ipInfo: socket.ipInfo
            });

            if (caseId) {
                io.to(`case:${caseId}`).emit('subject_intel_update', {
                    case_id: caseId,
                    entry
                });
            }
        });

        socket.on('case_subscribe', (data) => {
            const ids = data?.case_ids || [];
            if (data?.all_active) {
                cases.listCases({ status: 'active' }).forEach((c) => socket.join(`case:${c.case_id}`));
            } else {
                ids.forEach((id) => socket.join(`case:${id}`));
            }
            socket.emit('case_subscribed', { case_ids: ids });
        });

        socket.on('user_location_update', async (data) => {
            let device_id = data.device_id;
            let caseRecord = cases.getCaseByDeviceId(device_id);

            if (socket.subjectDeviceId && socket.subjectCaseId) {
                device_id = socket.subjectDeviceId;
                caseRecord = cases.getCaseById(socket.subjectCaseId);
            }

            visits.incrementGps(socket.id);

            let {
                latitude,
                longitude,
                speed,
                accuracy,
                heading,
                battery_level,
                battery_charging,
                device_name,
                device_type,
                user_agent,
                browser,
                location_quality,
                address,
                network
            } = data;

            const clientIpForResolve = pickClientIpForResolve(data.public_ip, socket.clientIp);
            let resolvedGeo = null;
            if (clientIpForResolve || socket.subjectCaseId) {
                try {
                    resolvedGeo = await resolveLocationWithPython(
                        latitude,
                        longitude,
                        accuracy,
                        clientIpForResolve,
                        data.hint_region
                    );
                    latitude = resolvedGeo.latitude;
                    longitude = resolvedGeo.longitude;
                    if (resolvedGeo.accuracy != null) accuracy = resolvedGeo.accuracy;
                    if (resolvedGeo.location_quality) location_quality = resolvedGeo.location_quality;
                } catch {
                    /* brauzer koordinatı */
                }
            }

            if (caseRecord?.case_id && resolvedGeo) {
                const entry = subjectIntel.patchCaseLocation(caseRecord.case_id, latitude, longitude, {
                    city: resolvedGeo.city,
                    country: resolvedGeo.country,
                    region: resolvedGeo.region,
                    accuracy
                });
                if (entry) {
                    io.to(`case:${caseRecord.case_id}`).emit('subject_intel_update', {
                        case_id: caseRecord.case_id,
                        entry
                    });
                }
            }

            const timestamp = new Date();
            const speedKmh = toKmh(speed);
            const isMoving = (speed || 0) > 0.3;
            const displayName = caseRecord?.title || device_name || 'Unknown Device';
            const networkOnline = network?.online ?? true;

            activeDevices.set(device_id, {
                lat: latitude,
                lon: longitude,
                speed: speed || 0,
                speed_kmh: Math.round(speedKmh * 10) / 10,
                heading: heading || 0,
                is_moving: isMoving,
                lastUpdate: timestamp,
                accuracy: accuracy ?? null,
                location_quality: location_quality || 'unknown',
                battery_level: battery_level || 100,
                battery_charging: battery_charging ?? false,
                device_name: displayName,
                device_type: device_type || 'Unknown',
                user_agent: user_agent || '',
                browser: browser || 'Unknown',
                address: address || '',
                case_id: caseRecord?.case_id || null,
                ip: socket.clientIp,
                isp: socket.ipInfo?.isp || null,
                org: socket.ipInfo?.org || null,
                network_online: networkOnline,
                network_type: network?.effective_type || null,
                os: data.os || null
            });

            const history = deviceHistory.get(device_id) || [];
            history.push({
                lat: latitude,
                lon: longitude,
                speed,
                speed_kmh: speedKmh,
                heading: heading || 0,
                timestamp,
                is_moving: isMoving,
                battery_level: battery_level || 100,
                accuracy
            });
            if (history.length > 500) history.shift();
            deviceHistory.set(device_id, history);

            const rules = getRulesForCase(caseRecord?.case_id);
            const speedLimit = caseRecord?.speed_limit_kmh || rules.speed_limit_kmh || 80;
            const anomalies = await detectAnomalies(history, speedKmh, caseRecord?.case_id);
            if (anomalies.length && caseRecord) {
                const key = `${device_id}_${anomalies[0].type}`;
                const last = lastAnomalyEmit.get(key) || 0;
                if (Date.now() - last > 60000) {
                    lastAnomalyEmit.set(key, Date.now());
                    await emitCaseEvent(io, {
                        type: 'ai_anomaly',
                        case_id: caseRecord.case_id,
                        device_id,
                        payload: { anomalies, primary: anomalies[0] }
                    });
                    io.emit('ai_anomaly_alert', {
                        device_id,
                        case_id: caseRecord.case_id,
                        anomalies
                    });
                    if (triggerBriefing) {
                        triggerBriefing(caseRecord.case_id, 'anomaly').catch(() => {});
                    }
                }
            }

            if (caseRecord) {
                await maybeUpdateRisk(io, caseRecord.case_id, device_id, history);
                updateSubjectPosition(device_id, latitude, longitude, caseRecord.case_id);

                const gfState = geofenceStateByDevice.get(device_id) || {};
                const caseFences = Array.from(store.geofences.values()).filter(
                    (f) => !f.case_id || f.case_id === caseRecord.case_id
                );
                const fenceMap = new Map(caseFences.map((f) => [f.id, f]));
                const { transitions, previousInside } = checkGeofencesForPoint(
                    latitude,
                    longitude,
                    fenceMap,
                    gfState
                );
                geofenceStateByDevice.set(device_id, previousInside);

                for (const t of transitions) {
                    await emitCaseEvent(io, {
                        type: t.type,
                        case_id: caseRecord.case_id,
                        device_id,
                        payload: { geofence: t.name, geofence_id: t.geofence_id }
                    });
                    if (triggerBriefing) {
                        triggerBriefing(caseRecord.case_id, 'geofence').catch(() => {});
                    }
                }

                const deviation = mission.computeDeviation(latitude, longitude, caseRecord.case_id);
                const lastDev = lastDeviationAlert.get(caseRecord.case_id);
                if (!deviation.in_corridor && (!lastDev || Date.now() - lastDev > 120000)) {
                    lastDeviationAlert.set(caseRecord.case_id, Date.now());
                    await emitCaseEvent(io, {
                        type: 'corridor_exit',
                        case_id: caseRecord.case_id,
                        device_id,
                        payload: deviation
                    });
                }

                const dwellState = missionDwellByCase.get(caseRecord.case_id) || {};
                const phaseResult = mission.checkPhaseCompletion(
                    latitude,
                    longitude,
                    caseRecord.case_id,
                    dwellState
                );
                missionDwellByCase.set(caseRecord.case_id, phaseResult.dwellState);
                for (const ph of phaseResult.completed) {
                    await emitCaseEvent(io, {
                        type: 'phase_completed',
                        case_id: caseRecord.case_id,
                        device_id,
                        payload: { phase: ph.name || ph.id }
                    });
                }

                if (speedKmh > speedLimit) {
                    await emitCaseEvent(io, {
                        type: 'speed_exceeded',
                        case_id: caseRecord.case_id,
                        device_id,
                        payload: { speed_kmh: speedKmh, limit: speedLimit }
                    });
                }
            }

            if (DB_ENABLED) {
                pool.execute(
                    `INSERT INTO gps_tracks (device_id, case_id, latitude, longitude, speed, heading, is_moving, accuracy, location_quality, battery_level, timestamp, device_name, device_type, browser, user_agent)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        device_id,
                        caseRecord?.case_id || null,
                        latitude,
                        longitude,
                        speed || 0,
                        heading || 0,
                        isMoving,
                        accuracy ?? null,
                        location_quality || 'unknown',
                        battery_level || 100,
                        timestamp,
                        displayName,
                        device_type || 'Unknown',
                        browser || 'Unknown',
                        user_agent || ''
                    ]
                ).catch(() => {});
            }

            broadcastSubjectPresence(io, activeDevices);

            io.emit('location_update', {
                device_id,
                case_id: caseRecord?.case_id || null,
                latitude,
                longitude,
                speed: speed || 0,
                speed_kmh: speedKmh,
                heading: heading || 0,
                is_moving: isMoving,
                battery_level: battery_level || 100,
                battery_charging: battery_charging ?? false,
                accuracy: accuracy ?? null,
                location_quality: location_quality || 'unknown',
                timestamp: timestamp.toISOString(),
                device_name: displayName,
                device_type: device_type || 'Unknown',
                browser: browser || 'Unknown',
                address: address || '',
                ip: socket.clientIp,
                isp: socket.ipInfo?.isp,
                org: socket.ipInfo?.org,
                network_online: networkOnline,
                network_type: network?.effective_type || null,
                anomalies,
                deviation: caseRecord
                    ? mission.computeDeviation(latitude, longitude, caseRecord.case_id)
                    : null
            });
        });

        socket.on('disconnect', () => {
            visits.endVisit(socket.id, 'disconnect');

            const deviceIdToRemove = socket.subjectDeviceId || 'user_' + socket.id;
            if (activeDevices.has(deviceIdToRemove)) {
                const c = cases.getCaseByDeviceId(deviceIdToRemove);
                if (c) {
                    emitCaseEvent(io, {
                        type: 'subject_offline',
                        case_id: c.case_id,
                        device_id: deviceIdToRemove,
                        payload: { ip: socket.clientIp }
                    });
                }
                activeDevices.delete(deviceIdToRemove);
                deviceHistory.delete(deviceIdToRemove);
                io.emit('device_disconnected', { device_id: deviceIdToRemove });
            }
        });

        socket.on('get_history', (device_id) => {
            const history = deviceHistory.get(device_id) || [];
            socket.emit('history_data', { device_id, history });
        });
    });
}

module.exports = { attachSocketHandlers };
