const { store, persist } = require('./store');
const cases = require('./cases');
const mission = require('./mission');
const { getCaseEvents, emitCaseEvent } = require('./events');
const { generateBriefing } = require('./pythonClient');

const BRIEFING_INTERVAL_MS = (Number(process.env.BRIEFING_INTERVAL_MIN) || 30) * 60 * 1000;
const lastBriefingAt = new Map();
const BRIEFING_COOLDOWN_MS = 5 * 60 * 1000;

function ensureBriefingStore() {
    if (!store.caseBriefings) store.caseBriefings = {};
}

function getCachedBriefing(caseId) {
    ensureBriefingStore();
    return store.caseBriefings[caseId] || null;
}

async function runBriefingForCase(io, caseId, reason, { activeDevices, deviceHistory }) {
    const c = cases.getCaseById(caseId);
    if (!c) return null;

    const last = lastBriefingAt.get(caseId) || 0;
    if (reason !== 'manual' && Date.now() - last < BRIEFING_COOLDOWN_MS) {
        return getCachedBriefing(caseId);
    }

    const history = deviceHistory.get(c.device_id) || [];
    const events = getCaseEvents(caseId, 50);
    const dev = activeDevices.get(c.device_id);
    const deviation = dev
        ? mission.computeDeviation(dev.lat, dev.lon, caseId)
        : { in_corridor: true, deviation_score: 0 };

    const briefing = await generateBriefing({
        case_id: caseId,
        title: c.title,
        history,
        events,
        deviation,
        route: mission.getMissionRoute(caseId)
    });

    if (!briefing) return null;

    ensureBriefingStore();
    const record = {
        ...briefing,
        case_id: caseId,
        updated_at: new Date().toISOString(),
        reason: reason || 'scheduled'
    };
    store.caseBriefings[caseId] = record;
    persist();
    lastBriefingAt.set(caseId, Date.now());

    if (io) {
        await emitCaseEvent(io, {
            type: 'briefing_updated',
            case_id: caseId,
            device_id: c.device_id,
            payload: { reason: record.reason, preview: (record.text || '').slice(0, 120) }
        });
        io.emit('briefing_updated', record);
    }

    return record;
}

function startBriefingWorker(io, deps) {
    const tick = async () => {
        try {
            const active = cases.listCases({ status: 'active' });
            for (const c of active) {
                await runBriefingForCase(io, c.case_id, 'scheduled', deps);
            }
        } catch (err) {
            console.warn('Briefing worker:', err.message);
        }
    };

    const interval = setInterval(tick, BRIEFING_INTERVAL_MS);
    tick();

    return {
        triggerBriefing: (caseId, reason) => runBriefingForCase(io, caseId, reason, deps),
        getCachedBriefing
    };
}

module.exports = { startBriefingWorker, runBriefingForCase, getCachedBriefing };
