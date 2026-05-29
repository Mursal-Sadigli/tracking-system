const { store, persist } = require('./store');
const { runAnalyticsBatch } = require('./pythonClient');
const { getRulesForCase } = require('./anomalyRules');

const gpsCountSinceRisk = new Map();
const lastRiskUpdateAt = new Map();
const RISK_GPS_INTERVAL = 10;
const RISK_MIN_MS = 3 * 60 * 1000;
const MAX_SNAPSHOTS_PER_CASE = 48;

function ensureRiskStore() {
    if (!store.riskSnapshots) store.riskSnapshots = {};
}

function riskLevelFromScore(score) {
    if (score < 45) return 'high';
    if (score < 75) return 'medium';
    return 'low';
}

function getRiskSnapshot(caseId) {
    ensureRiskStore();
    return store.riskSnapshots[caseId] || null;
}

function getAllRiskSnapshots() {
    ensureRiskStore();
    return { ...store.riskSnapshots };
}

function pushSnapshot(caseId, entry) {
    ensureRiskStore();
    const prev = store.riskSnapshots[caseId] || {
        case_id: caseId,
        score: entry.score,
        risk_level: entry.risk_level,
        updated_at: entry.ts,
        history: []
    };
    const history = [...(prev.history || []), { score: entry.score, risk_level: entry.risk_level, ts: entry.ts }];
    if (history.length > MAX_SNAPSHOTS_PER_CASE) {
        history.splice(0, history.length - MAX_SNAPSHOTS_PER_CASE);
    }
    store.riskSnapshots[caseId] = {
        case_id: caseId,
        score: entry.score,
        risk_level: entry.risk_level,
        updated_at: entry.ts,
        anomalies_count: entry.anomalies_count || 0,
        history
    };
    persist();
    return store.riskSnapshots[caseId];
}

async function maybeUpdateRisk(io, caseId, deviceId, history) {
    if (!caseId || !history?.length) return null;

    const count = (gpsCountSinceRisk.get(deviceId) || 0) + 1;
    gpsCountSinceRisk.set(deviceId, count);

    const lastAt = lastRiskUpdateAt.get(caseId) || 0;
    const dueByGps = count % RISK_GPS_INTERVAL === 0;
    const dueByTime = Date.now() - lastAt >= RISK_MIN_MS;
    if (!dueByGps && !dueByTime) return getRiskSnapshot(caseId);

    lastRiskUpdateAt.set(caseId, Date.now());

    const rules = getRulesForCase(caseId);
    const batch = await runAnalyticsBatch(history, {
        speed_limit_kmh: rules.speed_limit_kmh
    });
    const score = typeof batch.score === 'number' ? batch.score : 50;
    const risk_level = batch.risk_level || riskLevelFromScore(score);
    const ts = new Date().toISOString();
    const snapshot = pushSnapshot(caseId, {
        score,
        risk_level,
        ts,
        anomalies_count: (batch.anomalies || []).length
    });

    if (io) {
        io.emit('risk_score_update', {
            case_id: caseId,
            device_id: deviceId,
            score,
            risk_level,
            updated_at: ts,
            history: snapshot.history
        });
    }

    return snapshot;
}

module.exports = {
    maybeUpdateRisk,
    getRiskSnapshot,
    getAllRiskSnapshots,
    pushSnapshot,
    riskLevelFromScore
};
