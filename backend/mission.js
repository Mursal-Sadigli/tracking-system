const { store, persist } = require('./store');
const { minDistanceToPolylineMeters, pointInPolygon } = require('./geofence');
const { pool, DB_ENABLED } = require('./db');

function setMissionRoute(caseId, geojsonLine, bufferM = 200) {
    const route = {
        case_id: caseId,
        geojson_line: geojsonLine,
        corridor_buffer_m: bufferM,
        updated_at: new Date().toISOString()
    };
    store.missionRoutes.set(caseId, route);
    persist();
    return route;
}

function getMissionRoute(caseId) {
    return store.missionRoutes.get(caseId) || null;
}

function lineCoordsFromRoute(route) {
    if (!route?.geojson_line) return [];
    const g = route.geojson_line;
    if (g.type === 'LineString' && Array.isArray(g.coordinates)) {
        return g.coordinates.map(([lon, lat]) => ({ lat, lon }));
    }
    if (Array.isArray(g)) {
        return g.map((p) => ({ lat: p.lat ?? p[1], lon: p.lon ?? p[0] }));
    }
    return [];
}

function computeDeviation(lat, lon, caseId) {
    const route = getMissionRoute(caseId);
    if (!route) return { deviation_score: 0, distance_m: 0, in_corridor: true };

    const coords = lineCoordsFromRoute(route);
    const distance_m = minDistanceToPolylineMeters(lat, lon, coords);
    const buffer = route.corridor_buffer_m || 200;
    const in_corridor = distance_m <= buffer;
    const deviation_score = Math.min(100, Math.round((distance_m / (buffer * 2)) * 100));

    return { deviation_score, distance_m: Math.round(distance_m), in_corridor, buffer_m: buffer };
}

function setMissionPhases(caseId, phases) {
    store.missionPhases.set(caseId, phases);
    persist();
    return phases;
}

function getMissionPhases(caseId) {
    return store.missionPhases.get(caseId) || [];
}

function checkPhaseCompletion(lat, lon, caseId, dwellState = {}) {
    const phases = getMissionPhases(caseId);
    const completed = [];

    for (const phase of phases) {
        if (phase.completed) continue;
        const center = phase.center || { lat: phase.lat, lon: phase.lon };
        const radius = phase.radius_m || 100;
        const dist =
            Math.sqrt((lat - center.lat) ** 2 + (lon - center.lon) ** 2) * 111320;
        const inside = dist <= radius;

        const key = phase.id;
        if (inside) {
            dwellState[key] = (dwellState[key] || 0) + 1;
            if (dwellState[key] >= (phase.dwell_ticks || 4)) {
                phase.completed = true;
                completed.push(phase);
            }
        } else {
            dwellState[key] = 0;
        }
    }

    if (completed.length) persist();
    return { completed, dwellState };
}

async function saveMissionRouteDb(caseId, geojsonLine, bufferM) {
    if (!DB_ENABLED) return;
    try {
        await pool.execute(
            `INSERT INTO mission_routes (case_id, geojson_line, corridor_buffer_m)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE geojson_line=VALUES(geojson_line), corridor_buffer_m=VALUES(corridor_buffer_m)`,
            [caseId, JSON.stringify(geojsonLine), bufferM]
        );
    } catch (e) {
        console.warn('DB mission route:', e.message);
    }
}

module.exports = {
    setMissionRoute,
    getMissionRoute,
    computeDeviation,
    setMissionPhases,
    getMissionPhases,
    checkPhaseCompletion,
    saveMissionRouteDb,
    lineCoordsFromRoute
};
