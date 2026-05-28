const { runAnalyticsBatch } = require('./pythonClient');

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

function detectLocalAnomalies(history, speedKmh, speedLimit = 80) {
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
        if (dt > 0 && dt < 90 && dist > 3000) {
            anomalies.push({
                type: 'teleport',
                severity: 'high',
                explanation_az: `GPS sıçrayışı: ${(dist / 1000).toFixed(1)} km ${Math.round(dt)} saniyədə`,
                value: dist
            });
        }
    }
    const last = history[history.length - 1];
    if (last?.accuracy != null && last.accuracy > 250) {
        anomalies.push({
            type: 'accuracy',
            severity: 'low',
            explanation_az: `Zəif GPS dəqiqliyi: ±${Math.round(last.accuracy)} m`,
            value: last.accuracy
        });
    }
    return anomalies;
}

async function detectAnomalies(history, speedKmh, speedLimit) {
    const local = detectLocalAnomalies(history, speedKmh, speedLimit);
    if (history.length < 8) return local;

    try {
        const batch = await runAnalyticsBatch(history, { speed_limit_kmh: speedLimit });
        const fromPy = (batch.anomalies || []).map((a) => ({
            type: a.type,
            severity: a.severity || 'medium',
            explanation_az: a.explanation_az || `Anomaliya: ${a.type}`,
            value: a.value
        }));
        const merged = [...local];
        for (const p of fromPy) {
            if (!merged.some((m) => m.type === p.type)) merged.push(p);
        }
        return merged;
    } catch {
        return local;
    }
}

module.exports = { detectAnomalies, detectLocalAnomalies };
