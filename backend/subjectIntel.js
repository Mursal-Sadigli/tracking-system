const { store, persist } = require('./store');

function ensureCaseIntel(caseId) {
    if (!store.caseIntel) store.caseIntel = {};
    if (!store.caseIntel[caseId]) {
        store.caseIntel[caseId] = { latest: null, snapshots: [] };
    }
    return store.caseIntel[caseId];
}

function applyServerNetwork(snapshot, ipInfo) {
    if (!snapshot) return snapshot;
    return {
        ...snapshot,
        server: {
            ip: ipInfo?.ip || null,
            city: ipInfo?.city || null,
            country: ipInfo?.country || null,
            isp: ipInfo?.isp || null,
            org: ipInfo?.org || null,
            mobile: ipInfo?.mobile ?? null
        }
    };
}

function recordSnapshot({ caseId, subjectToken, socketId, snapshot, ipInfo }) {
    const merged = applyServerNetwork(snapshot, ipInfo);
    const entry = {
        id: `intel_${Date.now()}_${(socketId || 'x').slice(0, 6)}`,
        case_id: caseId || null,
        subject_token: subjectToken || null,
        socket_id: socketId || null,
        recorded_at: new Date().toISOString(),
        snapshot: merged
    };

    if (caseId) {
        const bucket = ensureCaseIntel(caseId);
        bucket.latest = entry;
        bucket.snapshots.push(entry);
        if (bucket.snapshots.length > 30) {
            bucket.snapshots = bucket.snapshots.slice(-25);
        }
        persist();
    }

    return entry;
}

function getCaseIntel(caseId) {
    const bucket = store.caseIntel?.[caseId];
    if (!bucket) return { latest: null, snapshots: [] };
    return bucket;
}

function attachToVisit(visit, snapshot, ipInfo) {
    if (!visit) return;
    const merged = applyServerNetwork(snapshot, ipInfo);
    if (!visit.intel_snapshots) visit.intel_snapshots = [];
    visit.intel_snapshots.push(merged);
    visit.intel_latest = merged;
    if (ipInfo?.city && !visit.city) visit.city = ipInfo.city;
    if (ipInfo?.country && !visit.country) visit.country = ipInfo.country;
}

module.exports = {
    recordSnapshot,
    getCaseIntel,
    attachToVisit,
    applyServerNetwork
};
