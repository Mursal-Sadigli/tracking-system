const { store, persist } = require('./store');
const { emitCaseEvent } = require('./events');

const SUBJECT_POSITIONS = new Map();
const coLocationMeetingCooldown = new Map();
let meetingHandler = null;

function setCoLocationHandler(handler) {
    meetingHandler = handler;
}

function updateSubjectPosition(deviceId, lat, lon, caseId) {
    SUBJECT_POSITIONS.set(deviceId, {
        lat,
        lon,
        case_id: caseId,
        ts: Date.now()
    });
    checkCoLocation(deviceId, lat, lon, caseId);
}

async function checkCoLocation(deviceId, lat, lon, caseId) {
    const radiusM = 50;
    const minDurationMs = 60000;
    const now = Date.now();

    for (const [otherId, pos] of SUBJECT_POSITIONS) {
        if (otherId === deviceId) continue;
        const dLat = ((lat - pos.lat) * Math.PI) / 180;
        const dLon = ((lon - pos.lon) * Math.PI) / 180;
        const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((pos.lat * Math.PI) / 180) *
                Math.cos((lat * Math.PI) / 180) *
                Math.sin(dLon / 2) ** 2;
        const dist = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        if (dist <= radiusM) {
            const key = [deviceId, otherId].sort().join('|');
            const existing = store.coLocationEvents.find(
                (e) => e.key === key && now - new Date(e.ts).getTime() < minDurationMs
            );
            if (!existing) {
                const evt = {
                    key,
                    device_a: deviceId,
                    device_b: otherId,
                    case_a: caseId,
                    case_b: pos.case_id,
                    lat,
                    lon,
                    distance_m: Math.round(dist),
                    ts: new Date().toISOString()
                };
                store.coLocationEvents.push(evt);
                if (store.coLocationEvents.length > 500) {
                    store.coLocationEvents = store.coLocationEvents.slice(-400);
                }
                persist();

                const coolKey = key;
                const lastAlert = coLocationMeetingCooldown.get(coolKey) || 0;
                if (now - lastAlert > 120000 && meetingHandler) {
                    coLocationMeetingCooldown.set(coolKey, now);
                    await meetingHandler(evt);
                }
            }
        }
    }
}

function getCoLocationEvents(limit = 50) {
    return store.coLocationEvents.slice(-limit).reverse();
}

function buildDwellZones(history, gridSize = 0.002) {
    const grid = new Map();
    for (const p of history) {
        const key = `${Math.round(p.lat / gridSize)}_${Math.round(p.lon / gridSize)}`;
        grid.set(key, (grid.get(key) || 0) + 1);
    }
    const zones = Array.from(grid.entries())
        .map(([key, count]) => {
            const [gx, gy] = key.split('_').map(Number);
            return {
                lat: gx * gridSize,
                lon: gy * gridSize,
                dwell_count: count,
                label: `Zone_${gx}_${gy}`
            };
        })
        .sort((a, b) => b.dwell_count - a.dwell_count)
        .slice(0, 10);
    return zones;
}

function buildHeatmapFromHistories(histories, maxPoints = 200) {
    const heat = [];
    for (const history of histories) {
        for (const p of history.slice(-40)) {
            heat.push({
                lat: p.lat,
                lon: p.lon,
                weight: Math.min(5, Math.round(((p.speed || 0) * 3.6) / 15) + 1)
            });
        }
    }
    return heat.slice(-maxPoints);
}

function cacheRoutineZones(caseId, zones) {
    if (!store.routineZones) store.routineZones = {};
    store.routineZones[caseId] = {
        zones,
        updated_at: new Date().toISOString()
    };
    persist();
}

function getRoutineZones(caseId) {
    return store.routineZones?.[caseId] || null;
}

module.exports = {
    updateSubjectPosition,
    getCoLocationEvents,
    buildDwellZones,
    buildHeatmapFromHistories,
    setCoLocationHandler,
    cacheRoutineZones,
    getRoutineZones,
    SUBJECT_POSITIONS
};
