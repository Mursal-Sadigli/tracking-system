function pointInPolygon(lat, lon, polygon) {
    if (!polygon || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lon;
        const yi = polygon[i].lat;
        const xj = polygon[j].lon;
        const yj = polygon[j].lat;
        const intersect =
            yi > lat !== yj > lat &&
            lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
}

function distancePointToSegmentMeters(px, py, ax, ay, bx, by) {
    const R = 6371000;
    const toRad = (v) => (v * Math.PI) / 180;
    const lat1 = toRad(ax);
    const lon1 = toRad(ay);
    const lat2 = toRad(bx);
    const lon2 = toRad(by);
    const latP = toRad(px);
    const lonP = toRad(py);

    const d12 =
        2 *
        Math.asin(
            Math.sqrt(
                Math.sin((lat2 - lat1) / 2) ** 2 +
                    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
            )
        );

    if (d12 < 1e-9) {
        return (
            2 *
            R *
            Math.asin(
                Math.sqrt(
                    Math.sin((latP - lat1) / 2) ** 2 +
                        Math.cos(lat1) * Math.cos(latP) * Math.sin((lonP - lon1) / 2) ** 2
                )
            )
        );
    }

    const d13 =
        2 *
        R *
        Math.asin(
            Math.sqrt(
                Math.sin((latP - lat1) / 2) ** 2 +
                    Math.cos(lat1) * Math.cos(latP) * Math.sin((lonP - lon1) / 2) ** 2
            )
        );
    const d23 =
        2 *
        R *
        Math.asin(
            Math.sqrt(
                Math.sin((latP - lat2) / 2) ** 2 +
                    Math.cos(lat2) * Math.cos(latP) * Math.sin((lonP - lon2) / 2) ** 2
            )
        );

    const t = Math.max(0, Math.min(1, (d13 * d13 - d23 * d23 + d12 * d12) / (2 * d12 * d12)));
    const proj = d13 * t;
    return Math.sqrt(Math.max(0, d13 * d13 - proj * proj)) * R / Math.max(d13, 1);
}

function minDistanceToPolylineMeters(lat, lon, lineCoords) {
    if (!lineCoords || lineCoords.length < 2) return Infinity;
    let min = Infinity;
    for (let i = 0; i < lineCoords.length - 1; i++) {
        const a = lineCoords[i];
        const b = lineCoords[i + 1];
        const d = distancePointToSegmentMeters(lat, lon, a.lat, a.lon, b.lat, b.lon);
        if (d < min) min = d;
    }
    return min;
}

function checkGeofencesForPoint(lat, lon, geofences, previousInside = {}) {
    const transitions = [];
    for (const [id, fence] of geofences) {
        const inside = pointInPolygon(lat, lon, fence.polygon);
        const wasInside = previousInside[id] || false;
        if (inside && !wasInside) {
            transitions.push({
                geofence_id: id,
                type: 'geofence_enter',
                name: fence.name,
                zone_type: fence.zone_type || 'restricted'
            });
        } else if (!inside && wasInside) {
            transitions.push({
                geofence_id: id,
                type: 'geofence_exit',
                name: fence.name,
                zone_type: fence.zone_type || 'restricted'
            });
        }
        previousInside[id] = inside;
    }
    return { transitions, previousInside };
}

module.exports = {
    pointInPolygon,
    minDistanceToPolylineMeters,
    checkGeofencesForPoint
};
