const { runAnalyticsBatch, runMlScore } = require('./pythonClient');
const { getRulesForCase } = require('./anomalyRules');

const ML_ENABLED = process.env.ML_ENABLED !== 'false';

function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function detectLocalAnomalies(history, speedKmh, rules) {
    const speedLimit = rules.speed_limit_kmh ?? 80;
    const teleportDist = rules.teleport_distance_m ?? 3000;
    const teleportSec = rules.teleport_max_seconds ?? 90;
    const accuracyMax = rules.accuracy_max_m ?? 250;

    const anomalies = [];
    if (speedKmh > speedLimit) {
        anomalies.push({
            type: 'speed',
            severity: speedKmh > speedLimit * 1.3 ? 'high' : 'medium',
            explanation_az: `Sürət limiti aşılıb: ${speedKmh.toFixed(0)} km/saat`,
            value: speedKmh
        });
    }
    const recent = history.slice(-5);
    if (recent.length >= 2) {
        const a = recent[recent.length - 2];
        const b = recent[recent.length - 1];
        const dist = haversineMeters(a.lat, a.lon, b.lat, b.lon);
        const dt = (new Date(b.timestamp) - new Date(a.timestamp)) / 1000;
        if (dt > 0 && dt < teleportSec && dist > teleportDist) {
            anomalies.push({
                type: 'teleport',
                severity: 'high',
                explanation_az: `GPS sıçrayışı: ${(dist / 1000).toFixed(1)} km ${Math.round(dt)} saniyədə`,
                value: dist
            });
        }
    }
    const last = history[history.length - 1];
    if (last?.accuracy != null && last.accuracy > accuracyMax) {
        anomalies.push({
            type: 'accuracy',
            severity: 'low',
            explanation_az: `Zəif GPS dəqiqliyi: ±${Math.round(last.accuracy)} m`,
            value: last.accuracy
        });
    }
    return anomalies;
}

function mergeAnomalies(local, fromMl) {
    const merged = [...local];
    for (const p of fromMl) {
        if (!merged.some((m) => m.type === p.type)) merged.push(p);
    }
    return merged;
}

function buildMlContext(rules, mlContext = {}) {
    return {
        in_corridor: mlContext.in_corridor !== false,
        deviation_score: mlContext.deviation_score ?? 0,
        speed_limit_kmh: mlContext.speed_limit_kmh ?? rules.speed_limit_kmh ?? 80,
        teleport_distance_m: rules.teleport_distance_m ?? 3000,
        teleport_max_seconds: rules.teleport_max_seconds ?? 90,
        accuracy_max_m: rules.accuracy_max_m ?? 250,
        recent_event_types: mlContext.recent_event_types || []
    };
}

async function runMlAnomalyScore({ deviceId, caseId, history, mlContext }) {
    if (!ML_ENABLED || !deviceId || history.length < 1) return null;
    const rules = getRulesForCase(caseId);
    const context = buildMlContext(rules, mlContext);
    const last = history[history.length - 1];
    try {
        return await runMlScore({
            device_id: deviceId,
            case_id: caseId,
            history,
            current: last,
            context
        });
    } catch {
        return null;
    }
}

async function detectAnomalies(history, speedKmh, caseId, mlContext = {}) {
    const rules = getRulesForCase(caseId);
    const speedLimit = rules.speed_limit_kmh ?? 80;
    const local = detectLocalAnomalies(history, speedKmh, rules);

    const deviceId = mlContext.device_id;
    const mlResult = await runMlAnomalyScore({
        deviceId,
        caseId,
        history,
        mlContext: { ...mlContext, speed_limit_kmh: speedLimit }
    });

    if (mlResult?.anomalies?.length) {
        const fromMl = mlResult.anomalies.map((a) => ({
            type: a.type,
            severity: a.severity || 'medium',
            explanation_az: a.explanation_az || `Anomaliya: ${a.type}`,
            value: a.value,
            score: a.score
        }));
        return { anomalies: mergeAnomalies(local, fromMl), mlResult };
    }

    if (history.length < 8) return { anomalies: local, mlResult };

    try {
        const batch = await runAnalyticsBatch(history, { speed_limit_kmh: speedLimit });
        const fromPy = (batch.anomalies || []).map((a) => ({
            type: a.type,
            severity: a.severity || 'medium',
            explanation_az: a.explanation_az || `Anomaliya: ${a.type}`,
            value: a.value
        }));
        return { anomalies: mergeAnomalies(local, fromPy), mlResult };
    } catch {
        return { anomalies: local, mlResult };
    }
}

module.exports = {
    detectAnomalies,
    detectLocalAnomalies,
    runMlAnomalyScore,
    ML_ENABLED
};
