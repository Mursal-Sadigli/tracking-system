const { store, persist } = require('./store');
const { lookupIp } = require('./ipLookup');
const { reverseGeocodeNominatim } = require('./locationResolve');

function ensureCaseIntel(caseId) {
    if (!store.caseIntel) store.caseIntel = {};
    if (!store.caseIntel[caseId]) {
        store.caseIntel[caseId] = { latest: null, snapshots: [] };
    }
    return store.caseIntel[caseId];
}

async function resolveIpInfo(socketIp, snapshot = {}) {
    const publicIp = snapshot.public_ip || snapshot.network?.public_ip || null;
    return lookupIp(socketIp, { publicIp });
}

async function enrichLocationPlace(location) {
    if (!location || location.latitude == null || location.longitude == null) {
        return location;
    }
    if (location.city) return location;

    const geo = await reverseGeocodeNominatim(location.latitude, location.longitude);
    return {
        ...location,
        city: geo.city || location.city || '',
        country: geo.country || location.country || '',
        source: location.source || 'nominatim'
    };
}

async function enrichSnapshot(snapshot, socketIp) {
    if (!snapshot) return snapshot;

    const ipInfo = await resolveIpInfo(socketIp, snapshot);
    let location = snapshot.location;
    if (location) {
        location = await enrichLocationPlace(location);
    }

    return applyServerNetwork({ ...snapshot, location }, ipInfo);
}

function applyServerNetwork(snapshot, ipInfo) {
    if (!snapshot) return snapshot;
    return {
        ...snapshot,
        server: {
            ip: ipInfo?.ip || null,
            lookup_ip: ipInfo?.lookup_ip || null,
            city: ipInfo?.city || null,
            country: ipInfo?.country || null,
            isp: ipInfo?.isp || null,
            org: ipInfo?.org || null,
            mobile: ipInfo?.mobile ?? null
        }
    };
}

async function recordSnapshot({ caseId, subjectToken, socketId, snapshot, ipInfo, socketIp }) {
    const merged = ipInfo
        ? applyServerNetwork(snapshot, ipInfo)
        : await enrichSnapshot(snapshot, socketIp);

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

async function attachToVisit(visit, snapshot, socketIp) {
    if (!visit) return;
    const merged = await enrichSnapshot(snapshot, socketIp);
    if (!visit.intel_snapshots) visit.intel_snapshots = [];
    visit.intel_snapshots.push(merged);
    visit.intel_latest = merged;
    if (merged.server?.city && !visit.city) visit.city = merged.server.city;
    if (merged.server?.country && !visit.country) visit.country = merged.server.country;
    if (merged.location?.city && !visit.city) visit.city = merged.location.city;
}

async function patchCaseLocation(caseId, latitude, longitude, place = {}) {
    const bucket = store.caseIntel?.[caseId];
    if (!bucket?.latest?.snapshot) return null;

    let city = place.city || '';
    let country = place.country || '';
    if (!city) {
        const geo = await reverseGeocodeNominatim(latitude, longitude);
        city = geo.city || '';
        country = country || geo.country || '';
    }

    bucket.latest.snapshot.location = {
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: place.accuracy ?? bucket.latest.snapshot.location?.accuracy ?? null,
        city,
        country,
        region: place.region || bucket.latest.snapshot.location?.region || '',
        source: 'gps_live'
    };
    persist();
    return bucket.latest;
}

module.exports = {
    recordSnapshot,
    getCaseIntel,
    attachToVisit,
    applyServerNetwork,
    patchCaseLocation,
    enrichSnapshot,
    resolveIpInfo
};
