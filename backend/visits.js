const { store, persist } = require('./store');

const activeVisits = new Map();

function startVisit(socketId, meta = {}) {
    const visit = {
        id: `visit_${Date.now()}_${socketId.slice(0, 6)}`,
        socket_id: socketId,
        started_at: new Date().toISOString(),
        ended_at: null,
        duration_sec: 0,
        consent_granted: false,
        gps_points: 0,
        case_id: meta.case_id || null,
        subject_token: meta.subject_token || null,
        ip: meta.ip || null,
        user_agent: meta.user_agent || '',
        device_type: meta.device_type || '',
        browser: meta.browser || '',
        isp: meta.isp || null,
        org: meta.org || null,
        reason: null
    };
    activeVisits.set(socketId, visit);
    return visit;
}

function markConsent(socketId) {
    const v = activeVisits.get(socketId);
    if (v) {
        v.consent_granted = true;
        v.consent_at = new Date().toISOString();
    }
}

function incrementGps(socketId) {
    const v = activeVisits.get(socketId);
    if (v) v.gps_points += 1;
}

function endVisit(socketId, reason = 'disconnect') {
    const v = activeVisits.get(socketId);
    if (!v) return null;

    v.ended_at = new Date().toISOString();
    v.duration_sec = Math.round((new Date(v.ended_at) - new Date(v.started_at)) / 1000);
    v.reason = reason;

    const isBrief =
        !v.consent_granted ||
        v.duration_sec < 45 ||
        (v.consent_granted && v.gps_points < 2 && v.duration_sec < 120);

    if (isBrief || v.duration_sec < 300) {
        if (!store.visitHistory) store.visitHistory = [];
        store.visitHistory.push({ ...v, brief: isBrief });
        if (store.visitHistory.length > 500) {
            store.visitHistory = store.visitHistory.slice(-400);
        }
        persist();
    }

    activeVisits.delete(socketId);
    return v;
}

function listVisits(limit = 100) {
    return (store.visitHistory || []).slice(-limit).reverse();
}

module.exports = { startVisit, markConsent, incrementGps, endVisit, listVisits, activeVisits };
