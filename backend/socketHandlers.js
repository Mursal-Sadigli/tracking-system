const cases = require('./cases');
const { emitCaseEvent } = require('./events');
const mission = require('./mission');
const { checkGeofencesForPoint } = require('./geofence');
const { store } = require('./store');
const { updateSubjectPosition } = require('./intel');
const { logConsent } = require('./compliance');
const { pool, DB_ENABLED } = require('./db');

const geofenceStateByDevice = new Map();
const missionDwellByCase = new Map();
const lastDeviationAlert = new Map();

function attachSocketHandlers(io, { activeDevices, deviceHistory, toKmh }) {
    io.on('connection', (socket) => {
        console.log('🔌 Client connected:', socket.id);

        socket.emit(
            'active_devices',
            Array.from(activeDevices.entries()).map(([id, data]) => ({
                device_id: id,
                ...data
            }))
        );

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

            await logConsent({
                case_id: c.case_id,
                subject_token: token,
                ip: socket.handshake.headers['x-forwarded-for']?.split(',')[0] || socket.handshake.address,
                user_agent: socket.handshake.headers['user-agent'],
                consent_text: data?.consent_text
            });

            await emitCaseEvent(io, {
                type: 'consent_granted',
                case_id: c.case_id,
                device_id: c.device_id,
                payload: { title: c.title }
            });

            socket.emit('subject_registered', {
                case_id: c.case_id,
                device_id: c.device_id,
                title: c.title
            });
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

            const {
                latitude,
                longitude,
                speed,
                accuracy,
                heading,
                battery_level,
                device_name,
                device_type,
                user_agent,
                browser,
                location_quality,
                address
            } = data;

            const timestamp = new Date();
            const isMoving = (speed || 0) > 0.3;
            const displayName = caseRecord?.title || device_name || 'Unknown Device';

            activeDevices.set(device_id, {
                lat: latitude,
                lon: longitude,
                speed: speed || 0,
                heading: heading || 0,
                is_moving: isMoving,
                lastUpdate: timestamp,
                accuracy: accuracy ?? null,
                location_quality: location_quality || 'unknown',
                battery_level: battery_level || 100,
                device_name: displayName,
                device_type: device_type || 'Unknown',
                user_agent: user_agent || '',
                browser: browser || 'Unknown',
                address: address || '',
                case_id: caseRecord?.case_id || null
            });

            const history = deviceHistory.get(device_id) || [];
            history.push({
                lat: latitude,
                lon: longitude,
                speed,
                heading: heading || 0,
                timestamp,
                is_moving: isMoving,
                battery_level: battery_level || 100,
                accuracy
            });
            if (history.length > 500) history.shift();
            deviceHistory.set(device_id, history);

            if (caseRecord) {
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
                }

                const deviation = mission.computeDeviation(
                    latitude,
                    longitude,
                    caseRecord.case_id
                );
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

                const speedKmh = toKmh(speed);
                if (speedKmh > (caseRecord.speed_limit_kmh || 80)) {
                    await emitCaseEvent(io, {
                        type: 'speed_exceeded',
                        case_id: caseRecord.case_id,
                        device_id,
                        payload: { speed_kmh: speedKmh, limit: caseRecord.speed_limit_kmh }
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

            io.emit('location_update', {
                device_id,
                case_id: caseRecord?.case_id || null,
                latitude,
                longitude,
                speed: speed || 0,
                heading: heading || 0,
                is_moving: isMoving,
                battery_level: battery_level || 100,
                accuracy: accuracy ?? null,
                location_quality: location_quality || 'unknown',
                timestamp: timestamp.toISOString(),
                device_name: displayName,
                device_type: device_type || 'Unknown',
                browser: browser || 'Unknown',
                address: address || '',
                deviation: caseRecord
                    ? mission.computeDeviation(latitude, longitude, caseRecord.case_id)
                    : null
            });
        });

        socket.on('disconnect', () => {
            const deviceIdToRemove = socket.subjectDeviceId || 'user_' + socket.id;
            if (activeDevices.has(deviceIdToRemove)) {
                const c = cases.getCaseByDeviceId(deviceIdToRemove);
                if (c) {
                    emitCaseEvent(io, {
                        type: 'subject_offline',
                        case_id: c.case_id,
                        device_id: deviceIdToRemove,
                        payload: {}
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
