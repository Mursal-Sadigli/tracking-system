const { polygonBbox, getSubjectsInZone, getExternalIngest } = require('../watchZones');
const { fetchTrafficSegments } = require('./traffic');
const { fetchFootTraffic } = require('./footTraffic');
const { fuseAreaZone } = require('../pythonClient');

async function buildZoneSnapshot(zone, activeDevices) {
    const bbox = polygonBbox(zone.polygon);
    const subjects = getSubjectsInZone(activeDevices, zone.polygon);
    const external = getExternalIngest(zone.id).map((d, i) => ({
        id: d.id || `ext_${i}`,
        lat: d.lat,
        lon: d.lon,
        source: d.source || 'external_api',
        kind: d.kind || 'external',
        label: d.label || 'Xarici'
    }));

    const [traffic, foot] = await Promise.all([
        fetchTrafficSegments(bbox),
        fetchFootTraffic(bbox)
    ]);

    const raw = {
        zone_id: zone.id,
        zone_name: zone.name,
        polygon: zone.polygon,
        subjects,
        traffic_segments: traffic.segments || [],
        foot_points: foot.points || [],
        external_devices: external,
        providers: {
            traffic: { configured: traffic.configured, error: traffic.error },
            foot_traffic: { configured: foot.configured, error: foot.error }
        },
        fetched_at: new Date().toISOString()
    };

    const fused = await fuseAreaZone(raw);
    return fused || raw;
}

module.exports = { buildZoneSnapshot, fetchTrafficSegments, fetchFootTraffic };
