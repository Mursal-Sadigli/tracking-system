const axios = require('axios');

const PYTHON_API = (process.env.PYTHON_API_URL || process.env.PYTHON_LOCATION_API || 'http://127.0.0.1:5001').replace(
    /\/$/,
    ''
);

async function postPython(path, body, timeout = 8000) {
    try {
        const res = await axios.post(`${PYTHON_API}${path}`, body, { timeout });
        return res.data;
    } catch (err) {
        console.warn(`Python ${path}:`, err.message);
        return null;
    }
}

async function runAnalyticsBatch(history, options = {}) {
    const data = await postPython('/analytics/batch', { history, ...options });
    if (data) return data;
    const { spawnSync } = require('child_process');
    const path = require('path');
    try {
        const result = spawnSync(
            process.env.PYTHON_BIN || 'python',
            [
                path.join(__dirname, '..', 'python-service', 'analytics_engine.py'),
                '--history',
                JSON.stringify(history)
            ],
            { encoding: 'utf8', timeout: 6000 }
        );
        if (result.status === 0 && result.stdout?.trim()) {
            return JSON.parse(result.stdout.trim());
        }
    } catch {
        // fallback below
    }
    return {
        score: 0,
        route_profile: {},
        anomalies: [],
        heatmap: [],
        risk_level: 'unknown'
    };
}

async function generateBriefing(payload) {
    const data = await postPython('/briefing/generate', payload, 12000);
    return data;
}

async function checkGeofenceBatch(point, polygons) {
    return postPython('/geofence/batch-check', { point, polygons });
}

async function runIntelProfile(history) {
    return postPython('/intel/profile', { history });
}

module.exports = {
    PYTHON_API,
    runAnalyticsBatch,
    generateBriefing,
    checkGeofenceBatch,
    runIntelProfile
};
