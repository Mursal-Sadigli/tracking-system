const { store, persist } = require('./store');

function ensureMlStore() {
    if (!store.mlSnapshots) store.mlSnapshots = {};
}

function saveMlSnapshot(caseId, payload) {
    if (!caseId || !payload) return null;
    ensureMlStore();
    const record = {
        case_id: caseId,
        device_id: payload.device_id || null,
        updated_at: new Date().toISOString(),
        model_version: payload.model_version || 'v1',
        risk_score: payload.risk_score,
        risk_level: payload.risk_level,
        anomalies: payload.anomalies || [],
        explanations: payload.explanations || [],
        baseline: payload.baseline || null,
        isolation_score: payload.isolation_score ?? null
    };
    store.mlSnapshots[caseId] = record;
    persist();
    return record;
}

function getMlSnapshot(caseId) {
    ensureMlStore();
    return store.mlSnapshots[caseId] || null;
}

module.exports = { saveMlSnapshot, getMlSnapshot };
