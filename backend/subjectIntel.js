const { store, persist } = require('./store');
const { lookupIp } = require('./ipLookup');
const { reverseGeocodePlace } = require('./geocodePlace');

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
    if (location.display_line && location.city) return location;

    const place = await reverseGeocodePlace(location.latitude, location.longitude);
    return {
        ...location,
        display_line: place.display_line,
        city: place.city || location.city || '',
        district: place.district || '',
        suburb: place.suburb || '',
        country: place.country || location.country || '',
        region_key: place.region_key,
        region_label: place.region_label,
        geocode_source: place.source,
        source: location.source || 'gps'
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
    const gpsLabel = merged.location?.display_line || merged.location?.city;
    if (gpsLabel) visit.city = gpsLabel;
    if (merged.location?.country) visit.country = merged.location.country;
}

async function patchCaseLocation(caseId, latitude, longitude, place = {}) {
    const bucket = store.caseIntel?.[caseId];
    if (!bucket?.latest?.snapshot) return null;

    const geo = place.display_line
        ? {
              display_line: place.display_line,
              city: place.city || place.display_line,
              district: place.district || '',
              suburb: place.suburb || '',
              country: place.country || '',
              region_key: place.region || '',
              region_label: place.region_label || '',
              geocode_source: place.geocode_source || 'gps_live',
              source: 'gps_live'
          }
        : await reverseGeocodePlace(latitude, longitude);

    bucket.latest.snapshot.location = {
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: place.accuracy ?? bucket.latest.snapshot.location?.accuracy ?? null,
        display_line: geo.display_line,
        city: geo.city,
        district: geo.district,
        suburb: geo.suburb,
        country: geo.country,
        region_key: geo.region_key,
        region_label: geo.region_label,
        geocode_source: geo.geocode_source || geo.source,
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
