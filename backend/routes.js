const express = require('express');
const { getCaseEvents } = require('./events');
const mission = require('./mission');
const { store } = require('./store');
const {
    getCoLocationEvents,
    buildDwellZones,
    buildHeatmapFromHistories,
    cacheRoutineZones,
    getRoutineZones
} = require('./intel');
const { runAnalyticsBatch, generateBriefing, runIntelProfile, runRoutineZones } = require('./pythonClient');
const { getRiskSnapshot, getAllRiskSnapshots } = require('./riskService');
const { getAllRules, setGlobalRules, setCaseRules } = require('./anomalyRules');
const { getCachedBriefing } = require('./briefingWorker');
const { pool, DB_ENABLED } = require('./db');
const visits = require('./visits');
const shareLinks = require('./shareLinks');
const cases = require('./cases');
const media = require('./media');
const watchZones = require('./watchZones');
const { buildZoneSnapshot } = require('./areaProviders');
const subjectIntel = require('./subjectIntel');
const { lookupIp } = require('./ipLookup');

function createApiRouter({ activeDevices, deviceHistory, requireAdminKey, io }) {
    const router = express.Router();
    const admin = requireAdminKey;

    router.get('/cases/by-token/:token', (req, res) => {
        const c = cases.getCaseByToken(req.params.token);
        if (!c) return res.status(404).json({ error: 'invalid_token' });
        if (c.status === 'closed') return res.status(410).json({ error: 'case_closed' });
        res.json({ valid: true, case_id: c.case_id, title: c.title });
    });

    router.get('/cases', admin, (req, res) => {
        res.json({ cases: cases.listCases({ status: req.query.status, priority: req.query.priority }) });
    });

    router.post('/cases', admin, async (req, res) => {
        const c = await cases.createCase(req.body);
        res.status(201).json(c);
    });

    router.get('/cases/:caseId', admin, (req, res) => {
        const c = cases.getCaseById(req.params.caseId);
        if (!c) return res.status(404).json({ error: 'not_found' });
        res.json(c);
    });

    router.patch('/cases/:caseId', admin, async (req, res) => {
        const c = await cases.updateCase(req.params.caseId, req.body);
        if (!c) return res.status(404).json({ error: 'not_found' });
        res.json(c);
    });

    router.post('/cases/:caseId/handoff', admin, async (req, res) => {
        const { operator_id } = req.body;
        const c = await cases.handoffCase(req.params.caseId, operator_id || 'operator');
        if (!c) return res.status(404).json({ error: 'not_found' });
        res.json(c);
    });

    router.get('/cases/:caseId/events', admin, (req, res) => {
        res.json({ events: getCaseEvents(req.params.caseId, Number(req.query.limit) || 100) });
    });

    router.post('/cases/:caseId/notes', admin, (req, res) => {
        const note = cases.addCaseNote(req.params.caseId, req.body.author, req.body.text);
        res.status(201).json(note);
    });

    router.get('/cases/:caseId/notes', admin, (req, res) => {
        res.json({ notes: cases.getCaseNotes(req.params.caseId) });
    });

    router.get('/cases/:caseId/subject-link', admin, (req, res) => {
        const c = cases.getCaseById(req.params.caseId);
        if (!c) return res.status(404).json({ error: 'not_found' });
        const base = req.query.frontend_base || '';
        res.json({
            path: `/s/${c.subject_token}`,
            url: `${base}/s/${c.subject_token}`
        });
    });

    router.put('/cases/:caseId/mission/route', admin, async (req, res) => {
        const { geojson_line, corridor_buffer_m } = req.body;
        const route = mission.setMissionRoute(
            req.params.caseId,
            geojson_line,
            corridor_buffer_m ?? 200
        );
        await mission.saveMissionRouteDb(req.params.caseId, geojson_line, corridor_buffer_m ?? 200);
        res.json(route);
    });

    router.get('/cases/:caseId/mission/route', admin, (req, res) => {
        res.json(mission.getMissionRoute(req.params.caseId) || {});
    });

    router.get('/cases/:caseId/mission/deviation', admin, (req, res) => {
        const deviceId = cases.getCaseById(req.params.caseId)?.device_id;
        const dev = activeDevices.get(deviceId);
        if (!dev) return res.json({ deviation_score: 0, in_corridor: true });
        res.json(mission.computeDeviation(dev.lat, dev.lon, req.params.caseId));
    });

    router.put('/cases/:caseId/mission/phases', admin, (req, res) => {
        res.json(mission.setMissionPhases(req.params.caseId, req.body.phases || []));
    });

    router.get('/cases/:caseId/mission/phases', admin, (req, res) => {
        res.json({ phases: mission.getMissionPhases(req.params.caseId) });
    });

    router.get('/cases/:caseId/briefing', admin, (req, res) => {
        const cached = getCachedBriefing(req.params.caseId);
        if (cached) return res.json(cached);
        res.json({ text: null, bullets: [], updated_at: null });
    });

    router.post('/cases/:caseId/briefing', admin, async (req, res) => {
        const caseId = req.params.caseId;
        const c = cases.getCaseById(caseId);
        const history = deviceHistory.get(c?.device_id) || [];
        const events = getCaseEvents(caseId, 50);
        const deviation = c
            ? mission.computeDeviation(
                  activeDevices.get(c.device_id)?.lat || 0,
                  activeDevices.get(c.device_id)?.lon || 0,
                  caseId
              )
            : {};
        const briefing = await generateBriefing({
            case_id: caseId,
            title: c?.title,
            history,
            events,
            deviation,
            route: mission.getMissionRoute(caseId)
        });
        const out = briefing || { text: 'Briefing hazırlanmadı.', bullets: [] };
        if (!store.caseBriefings) store.caseBriefings = {};
        store.caseBriefings[caseId] = {
            ...out,
            case_id: caseId,
            updated_at: new Date().toISOString(),
            reason: 'manual'
        };
        require('./store').persist();
        res.json(store.caseBriefings[caseId]);
    });

    router.get('/intel/risk', admin, (req, res) => {
        res.json({ snapshots: getAllRiskSnapshots() });
    });

    router.get('/intel/risk/:caseId', admin, (req, res) => {
        const snap = getRiskSnapshot(req.params.caseId);
        if (!snap) return res.json({ case_id: req.params.caseId, score: null, history: [] });
        res.json(snap);
    });

    router.get('/anomaly-rules', admin, (req, res) => {
        res.json(getAllRules());
    });

    router.put('/anomaly-rules', admin, (req, res) => {
        const { case_id, rules } = req.body;
        if (case_id) {
            return res.json({ case_id, rules: setCaseRules(case_id, rules || {}) });
        }
        res.json({ global: setGlobalRules(rules || {}) });
    });

    router.get('/intel/routine-zones/:caseId', admin, async (req, res) => {
        const caseId = req.params.caseId;
        const c = cases.getCaseById(caseId);
        if (!c) return res.status(404).json({ error: 'not_found' });
        const history = deviceHistory.get(c.device_id) || [];
        const cached = getRoutineZones(caseId);
        if (cached && !req.query.refresh) {
            return res.json(cached);
        }
        const result = await runRoutineZones(history);
        const zones = result?.zones || buildDwellZones(history).map((z, i) => ({
            ...z,
            label: z.label,
            radius_m: 120,
            type: i === 0 ? 'primary' : 'secondary'
        }));
        const payload = { case_id: caseId, zones, updated_at: new Date().toISOString() };
        cacheRoutineZones(caseId, zones);
        res.json(payload);
    });

    router.get('/intel/profile/:caseId', admin, async (req, res) => {
        const c = cases.getCaseById(req.params.caseId);
        const history = deviceHistory.get(c?.device_id) || [];
        const profile = await runIntelProfile(history);
        const dwell = buildDwellZones(history);
        res.json({ ...(profile || {}), dwell_zones: dwell });
    });

    router.get('/intel/co-location', admin, (req, res) => {
        res.json({ events: getCoLocationEvents(100) });
    });

    router.get('/intel/heatmap', admin, (req, res) => {
        const histories = Array.from(deviceHistory.values());
        res.json({ heatmap: buildHeatmapFromHistories(histories) });
    });

    router.get('/geofences', admin, (req, res) => {
        res.json({
            geofences: Array.from(store.geofences.values())
        });
    });

    router.post('/geofences', admin, (req, res) => {
        const id = req.body.id || `gf_${Date.now()}`;
        const fence = {
            id,
            case_id: req.body.case_id,
            name: req.body.name || 'Zona',
            polygon: req.body.polygon
        };
        store.geofences.set(id, fence);
        require('./store').persist();
        res.status(201).json(fence);
    });

    router.delete('/geofences/:id', admin, (req, res) => {
        store.geofences.delete(req.params.id);
        require('./store').persist();
        res.json({ ok: true });
    });

    router.get('/analytics/score/:deviceId', admin, async (req, res) => {
        const history = deviceHistory.get(req.params.deviceId) || [];
        const score = await runAnalyticsBatch(history);
        res.json({ deviceId: req.params.deviceId, ...score, points: history.length });
    });

    router.get('/visits', admin, (req, res) => {
        res.json({ visits: visits.listVisits(Number(req.query.limit) || 100) });
    });

    router.get('/cases/:caseId/subject-intel', admin, (req, res) => {
        const intel = subjectIntel.getCaseIntel(req.params.caseId);
        res.json(intel);
    });

    router.post('/subject-intel/snapshot', async (req, res) => {
        try {
            const { subject_token: token, snapshot } = req.body || {};
            if (!token || !snapshot) {
                return res.status(400).json({ error: 'missing_fields' });
            }
            const c = cases.getCaseByToken(token);
            if (!c) return res.status(404).json({ error: 'invalid_token' });

            const clientIp =
                req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                String(req.socket.remoteAddress || '').replace('::ffff:', '');
            const ipInfo = await lookupIp(clientIp);

            const entry = subjectIntel.recordSnapshot({
                caseId: c.case_id,
                subjectToken: token,
                socketId: null,
                snapshot,
                ipInfo
            });

            if (io) {
                io.to(`case:${c.case_id}`).emit('subject_intel_update', {
                    case_id: c.case_id,
                    entry
                });
            }

            res.json({ ok: true, case_id: c.case_id, entry_id: entry.id });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    router.post('/subject-intel/beacon', (req, res) => {
        const token = req.body?.subject_token;
        if (token) {
            const c = cases.getCaseByToken(token);
            if (c) {
                const entry = subjectIntel.recordSnapshot({
                    caseId: c.case_id,
                    subjectToken: token,
                    socketId: null,
                    snapshot: {
                        phase: req.body?.phase || 'beacon_unload',
                        collected_at: new Date().toISOString(),
                        beacon: true
                    },
                    ipInfo: {
                        ip: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress,
                        city: null,
                        country: null,
                        isp: null,
                        org: null
                    }
                });
                return res.json({ ok: true, entry_id: entry.id });
            }
        }
        res.json({ ok: true });
    });

    router.get('/cases/:caseId/media', admin, (req, res) => {
        res.json({ media: media.listByCase(req.params.caseId, Number(req.query.limit) || 50) });
    });

    router.post('/cases/:caseId/share', admin, (req, res) => {
        const minutes = Number(req.body.expires_minutes) || 60;
        const link = shareLinks.createShareLink(req.params.caseId, minutes);
        const base = req.body.frontend_base || '';
        res.status(201).json({
            ...link,
            path: `/watch/${link.token}`,
            url: `${base}/watch/${link.token}`
        });
    });

    router.get('/share/:token', (req, res) => {
        const link = shareLinks.getShareLink(req.params.token);
        if (!link) return res.status(404).json({ error: 'expired_or_invalid' });
        const c = cases.getCaseById(link.case_id);
        const device = c ? activeDevices.get(c.device_id) : null;
        res.json({
            valid: true,
            case_id: link.case_id,
            title: c?.title,
            expires_at: link.expires_at,
            device: device || null
        });
    });

    router.get('/watch-zones', admin, (req, res) => {
        res.json({ zones: watchZones.listWatchZones() });
    });

    router.post('/watch-zones', admin, (req, res) => {
        try {
            const zone = watchZones.createWatchZone({
                name: req.body.name,
                polygon: req.body.polygon,
                enabled: req.body.enabled
            });
            res.status(201).json(zone);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    router.patch('/watch-zones/:id', admin, (req, res) => {
        const zone = watchZones.updateWatchZone(req.params.id, req.body);
        if (!zone) return res.status(404).json({ error: 'not_found' });
        res.json(zone);
    });

    router.delete('/watch-zones/:id', admin, (req, res) => {
        watchZones.deleteWatchZone(req.params.id);
        res.json({ ok: true });
    });

    router.get('/watch-zones/:id/presence', admin, async (req, res) => {
        const zone = watchZones.getWatchZone(req.params.id);
        if (!zone) return res.status(404).json({ error: 'not_found' });
        const subjects = watchZones.getSubjectsInZone(activeDevices, zone.polygon);
        res.json({ zone_id: zone.id, subjects });
    });

    router.get('/watch-zones/:id/snapshot', admin, async (req, res) => {
        const zone = watchZones.getWatchZone(req.params.id);
        if (!zone) return res.status(404).json({ error: 'not_found' });
        const snapshot = await buildZoneSnapshot(zone, activeDevices);
        res.json(snapshot);
    });

    router.post('/watch-zones/:id/external-ingest', admin, (req, res) => {
        const zone = watchZones.getWatchZone(req.params.id);
        if (!zone) return res.status(404).json({ error: 'not_found' });
        watchZones.setExternalIngest(req.params.id, req.body.devices || []);
        res.json({ ok: true, count: (req.body.devices || []).length });
    });

    return router;
}

module.exports = { createApiRouter };
