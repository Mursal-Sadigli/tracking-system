const express = require('express');
const { getCaseEvents } = require('./events');
const mission = require('./mission');
const { store } = require('./store');
const { getCoLocationEvents, buildDwellZones, buildHeatmapFromHistories } = require('./intel');
const { runAnalyticsBatch, generateBriefing, runIntelProfile } = require('./pythonClient');
const { pool, DB_ENABLED } = require('./db');
const visits = require('./visits');
const shareLinks = require('./shareLinks');
const cases = require('./cases');

function createApiRouter({ activeDevices, deviceHistory, requireAdminKey }) {
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
        res.json(briefing || { text: 'Briefing hazırlanmadı.', bullets: [] });
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

    return router;
}

module.exports = { createApiRouter };
