const watchZones = require('./watchZones');
const { buildZoneSnapshot } = require('./areaProviders');

function startAreaWatchWorker(io, activeDevices) {
    const ms = Number(process.env.WATCH_ZONE_POLL_MS) || 30000;

    const tick = async () => {
        const zones = watchZones.listWatchZones().filter((z) => z.enabled !== false);
        for (const zone of zones) {
            try {
                const payload = await buildZoneSnapshot(zone, activeDevices);
                io.emit('area_zone_update', payload);
                io.emit('watch_zone_presence', {
                    zone_id: zone.id,
                    zone_name: zone.name,
                    subjects: payload.subjects || [],
                    counts: {
                        subjects: (payload.subjects || []).length,
                        traffic: (payload.traffic_segments || []).length,
                        foot: (payload.foot_points || []).length,
                        external: (payload.external_devices || []).length
                    }
                });
            } catch (err) {
                console.warn('area watch zone', zone.id, err.message);
            }
        }
    };

    setTimeout(tick, 5000);
    const interval = setInterval(tick, ms);
    return () => clearInterval(interval);
}

function broadcastSubjectPresence(io, activeDevices) {
    const zones = watchZones.listWatchZones().filter((z) => z.enabled !== false);
    for (const zone of zones) {
        const subjects = watchZones.getSubjectsInZone(activeDevices, zone.polygon);
        io.emit('watch_zone_presence', {
            zone_id: zone.id,
            zone_name: zone.name,
            subjects,
            counts: { subjects: subjects.length }
        });
    }
}

module.exports = { startAreaWatchWorker, broadcastSubjectPresence };
