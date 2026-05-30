const { store, persist } = require('./store');
const { pointInPolygon } = require('./geofence');

function ensureStore() {
    if (!store.watchZones) store.watchZones = new Map();
    if (!store.watchZoneExternal) store.watchZoneExternal = new Map();
}

function listWatchZones() {
    ensureStore();
    return Array.from(store.watchZones.values());
}

function getWatchZone(id) {
    ensureStore();
    return store.watchZones.get(id) || null;
}

function createWatchZone({ name, polygon, enabled = true }) {
    ensureStore();
    if (!polygon || polygon.length < 3) {
        throw new Error('polygon_min_3');
    }
    const id = `wz_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const zone = {
        id,
        name: name || 'İzləmə zonası',
        polygon,
        enabled: enabled !== false,
        created_at: new Date().toISOString()
    };
    store.watchZones.set(id, zone);
    persist();
    return zone;
}

function updateWatchZone(id, patch) {
    ensureStore();
    const z = store.watchZones.get(id);
    if (!z) return null;
    const next = { ...z, ...patch, id };
    if (patch.polygon && patch.polygon.length < 3) throw new Error('polygon_min_3');
    store.watchZones.set(id, next);
    persist();
    return next;
}

function deleteWatchZone(id) {
    ensureStore();
    store.watchZones.delete(id);
    store.watchZoneExternal.delete(id);
    persist();
    return true;
}

function polygonBbox(polygon) {
    let minLat = 90;
    let maxLat = -90;
    let minLon = 180;
    let maxLon = -180;
    for (const p of polygon) {
        const lat = p.lat;
        const lon = p.lon != null ? p.lon : p.lng;
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
    }
    return { minLat, maxLat, minLon, maxLon };
}

function getSubjectsInZone(activeDevices, polygon) {
    const subjects = [];
    for (const [device_id, data] of activeDevices.entries()) {
        if (data.lat == null || data.lon == null) continue;
        if (!pointInPolygon(data.lat, data.lon, polygon)) continue;
        subjects.push({
            id: device_id,
            device_id,
            lat: data.lat,
            lon: data.lon,
            source: 'subject',
            kind: 'subject',
            label: data.device_name || device_id,
            case_id: data.case_id,
            speed_kmh: data.speed_kmh,
            lastUpdate: data.lastUpdate
        });
    }
    return subjects;
}

function setExternalIngest(zoneId, devices) {
    ensureStore();
    store.watchZoneExternal.set(zoneId, {
        devices: Array.isArray(devices) ? devices : [],
        updated_at: new Date().toISOString()
    });
    persist();
}

function getExternalIngest(zoneId) {
    ensureStore();
    return store.watchZoneExternal.get(zoneId)?.devices || [];
}

module.exports = {
    listWatchZones,
    getWatchZone,
    createWatchZone,
    updateWatchZone,
    deleteWatchZone,
    polygonBbox,
    getSubjectsInZone,
    setExternalIngest,
    getExternalIngest,
    pointInPolygon
};
