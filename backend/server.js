const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const { Server } = require('socket.io');
const cors = require('cors');
const axios = require('axios');
const { pool, initDB, runRetention } = require('./db');
const { requireAdminKey, handleAdminLogin } = require('./auth');
const { createApiRouter } = require('./routes');
const { attachSocketHandlers } = require('./socketHandlers');
const { runAnalyticsBatch } = require('./pythonClient');
const { getConsentLogs } = require('./compliance');

const PYTHON_LOCATION_API = process.env.PYTHON_LOCATION_API || 'http://127.0.0.1:5001';
const PYTHON_SERVICE_DIR = path.join(__dirname, '..', 'python-service');
const locationResolveCache = new Map();
const LOCATION_CACHE_MS = 8000;

const app = express();
const server = http.createServer(app);
const EXTRA_ORIGINS = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    ...EXTRA_ORIGINS
];

function isAllowedOrigin(origin) {
    if (!origin) return true;
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    if (/^https:\/\/[\w.-]+\.vercel\.app$/i.test(origin)) return true;
    return (
        /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin) ||
        /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/i.test(origin)
    );
}

function shouldSpawnLocalPython() {
    try {
        const host = new URL(PYTHON_LOCATION_API).hostname;
        return host === '127.0.0.1' || host === 'localhost';
    } catch {
        return true;
    }
}

function corsOrigin(origin, callback) {
    if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
    } else {
        callback(null, false);
    }
}

const io = new Server(server, {
    cors: {
        origin: (origin, callback) => {
            if (!origin || isAllowedOrigin(origin)) {
                callback(null, true);
            } else {
                callback(null, false);
            }
        },
        methods: ['GET', 'POST', 'OPTIONS']
    },
    transports: ['polling', 'websocket'],
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(
    cors({
        origin: corsOrigin,
        methods: ['GET', 'POST', 'OPTIONS']
    })
);
app.use(express.json({ limit: '2mb' }));

try {
    const rateLimit = require('express-rate-limit');
    app.use(
        '/api/',
        rateLimit({
            windowMs: 60 * 1000,
            max: Number(process.env.RATE_LIMIT_MAX) || 300,
            standardHeaders: true,
            legacyHeaders: false
        })
    );
} catch {
    console.warn('express-rate-limit not installed — skip rate limit');
}

function healthHandler(req, res) {
    res.json({
        ok: true,
        port: Number(process.env.PORT) || 3500,
        service: 'tracking-backend'
    });
}

app.get('/api/health', healthHandler);
app.get('/health', healthHandler);

// Store active devices and their locations in memory (cache)
const activeDevices = new Map(); // device_id -> { lat, lon, speed, lastUpdate }
const deviceHistory = new Map(); // device_id -> array of last 100 points

// City vehicles simulator
const cityVehicles = new Map(); // cityName -> array of vehicle objects
const cityRoads = new Map(); // cityName -> array of road coordinates
const vehicleIntervals = new Map(); // cityName -> interval id

function toKmh(speed) {
    return (speed || 0) * 3.6;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getPythonExecutable() {
    const venvPython = path.join(PYTHON_SERVICE_DIR, 'venv', 'Scripts', 'python.exe');
    if (fs.existsSync(venvPython)) return venvPython;
    return process.env.PYTHON_BIN || 'python';
}

function getClientIp(socket) {
    const forwarded = socket.handshake.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
    return String(socket.handshake.address || '').replace('::ffff:', '');
}

async function resolveLocationWithPython(latitude, longitude, accuracy, clientIp, hintRegion) {
    const cacheKey = `${Number(latitude).toFixed(3)}_${Number(longitude).toFixed(3)}_${clientIp || 'noip'}_${hintRegion || ''}`;
    const cached = locationResolveCache.get(cacheKey);
    if (cached && Date.now() - cached.at < LOCATION_CACHE_MS) {
        return cached.result;
    }

    const payload = {
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: accuracy != null ? Number(accuracy) : null,
        client_ip: clientIp || null,
        hint_region: hintRegion || null
    };

    let result = null;

    try {
        const res = await axios.post(`${PYTHON_LOCATION_API}/resolve`, payload, { timeout: 4500 });
        result = res.data;
    } catch {
        try {
            const spawnResult = spawnSync(
                getPythonExecutable(),
                [
                    path.join(PYTHON_SERVICE_DIR, 'location_resolver.py'),
                    '--payload',
                    JSON.stringify(payload)
                ],
                { encoding: 'utf8', timeout: 6000, cwd: PYTHON_SERVICE_DIR }
            );
            if (spawnResult.status === 0 && spawnResult.stdout?.trim()) {
                result = JSON.parse(spawnResult.stdout.trim());
            }
        } catch (err) {
            console.error('Python location_resolver error:', err.message);
        }
    }

    if (!result) {
        result = {
            latitude: payload.latitude,
            longitude: payload.longitude,
            accuracy: payload.accuracy,
            corrected: false,
            source: 'browser_gps',
            city: '',
            region: 'unknown',
            location_quality: 'approximate',
            reason: 'python_unavailable'
        };
    }

    locationResolveCache.set(cacheKey, { at: Date.now(), result });
    return result;
}

function startPythonLocationApi() {
    const scriptPath = path.join(PYTHON_SERVICE_DIR, 'location_api.py');
    if (!fs.existsSync(scriptPath)) return;

    const child = spawn(getPythonExecutable(), [scriptPath], {
        cwd: PYTHON_SERVICE_DIR,
        detached: false,
        stdio: 'ignore',
        windowsHide: true
    });

    child.on('error', (err) => {
        console.warn('⚠️ Python location_api başlamadı:', err.message);
        console.warn('   Əl ilə: cd python-service && python location_api.py');
    });

    process.on('exit', () => {
        try {
            child.kill();
        } catch {
            // ignore
        }
    });
}

// Get roads from Overpass API
async function getOverpassRoads(cityName) {
    try {
        const bounds = getCityBounds(cityName);
        const [south, west, north, east] = bounds.split(',').map(Number);

        const query = `[bbox:${south},${west},${north},${east}];
(
  way["highway"~"^(primary|secondary|tertiary|residential|living_street)$"];
);
out geom;`;

        const response = await axios.post('https://overpass-api.de/api/interpreter', query, {
            timeout: 10000,
            headers: { 'Content-Type': 'text/plain' }
        });

        const roads = [];
        response.data.elements?.forEach(way => {
            if (way.geometry && way.geometry.length > 1) {
                roads.push(way.geometry.map(p => ({ lat: p.lat, lon: p.lon })));
            }
        });

        return roads.length > 0 ? roads : getDefaultRoads(cityName);
    } catch (error) {
        console.error(`Overpass error for ${cityName}:`, error.message);
        return getDefaultRoads(cityName);
    }
}

function getCityBounds(cityName) {
    const bounds = {
        'baku': '40.3156,49.1694,40.4512,49.6846',
        'lankaran': '38.7417,48.7500,38.8833,48.9000',
        'quba': '41.3494,48.3833,41.4500,48.5167',
        'shaki': '41.6000,47.1667,41.6500,47.2167',
        'ganja': '40.6667,46.3667,40.7833,46.5333',
        'sumqait': '40.5833,48.7333,40.6500,48.8667'
    };
    return bounds[cityName.toLowerCase()] || '40.3156,49.1694,40.4512,49.6846';
}

function getDefaultRoads(cityName) {
    const defaultRoads = {
        'baku': [
            [
                { lat: 40.38, lon: 49.25 }, { lat: 40.39, lon: 49.30 },
                { lat: 40.40, lon: 49.35 }, { lat: 40.41, lon: 49.40 }
            ],
            [
                { lat: 40.35, lon: 49.28 }, { lat: 40.38, lon: 49.28 },
                { lat: 40.41, lon: 49.28 }, { lat: 40.43, lon: 49.28 }
            ],
            [
                { lat: 40.37, lon: 49.20 }, { lat: 40.37, lon: 49.35 }
            ]
        ],
        'lankaran': [
            [
                { lat: 38.75, lon: 48.80 }, { lat: 38.76, lon: 48.82 },
                { lat: 38.77, lon: 48.84 }
            ]
        ]
    };
    return defaultRoads[cityName.toLowerCase()] || defaultRoads['baku'];
}

function createVehicle(id, lat, lon) {
    return {
        id,
        lat,
        lon,
        speed: 10 + Math.random() * 20,
        heading: Math.random() * 360,
        roadIndex: 0,
        pointIndex: 0,
        isMoving: true
    };
}

function updateVehicle(vehicle, roads) {
    if (!roads || roads.length === 0) return;

    const road = roads[vehicle.roadIndex];
    if (!road || road.length < 2) return;

    const current = road[vehicle.pointIndex];
    const next = road[vehicle.pointIndex + 1];

    if (!current || !next) {
        vehicle.roadIndex = (vehicle.roadIndex + 1) % roads.length;
        vehicle.pointIndex = 0;
        return;
    }

    const distance = haversineMeters(current.lat, current.lon, next.lat, next.lon);
    const moveDistance = (vehicle.speed / 3.6) / 10;

    if (moveDistance > distance) {
        vehicle.pointIndex++;
        if (vehicle.pointIndex >= road.length - 1) {
            vehicle.roadIndex = (vehicle.roadIndex + 1) % roads.length;
            vehicle.pointIndex = 0;
        }
    } else {
        const ratio = moveDistance / distance;
        vehicle.lat = current.lat + (next.lat - current.lat) * ratio;
        vehicle.lon = current.lon + (next.lon - current.lon) * ratio;
        vehicle.heading = Math.atan2(next.lon - current.lon, next.lat - current.lat) * 180 / Math.PI;
    }

    vehicle.speed += (Math.random() - 0.5) * 2;
    vehicle.speed = Math.max(5, Math.min(40, vehicle.speed));
}

async function runPythonAnalytics(history = []) {
    return runAnalyticsBatch(history);
}

function computeRouteRecommendation(history = []) {
    if (!history.length) return { short: 'No route data yet', safe: 'No route data yet', efficient: 'No route data yet' };

    const recent = history.slice(-12);
    const distance = recent.reduce((sum, point, index) => {
        if (index === 0) return sum;
        const prev = recent[index - 1];
        return sum + haversineMeters(prev.lat, prev.lon, point.lat, point.lon);
    }, 0);

    const avgSpeed = recent.reduce((sum, item) => sum + (item.speed || 0), 0) / recent.length;
    const maxSpeed = Math.max(...recent.map(item => item.speed || 0));
    const sharpTurns = recent.filter((item, index) => index > 0 && Math.abs((item.heading || 0) - (recent[index - 1].heading || 0)) > 35).length;

    return {
        short: distance > 500 ? 'Use the shortest corridor with fewer stops to reduce travel time.' : 'Current route is already compact for this trip.',
        safe: sharpTurns > 1 ? 'Reduce sharp turns and keep speed below 50 km/h in dense zones.' : 'Current route looks stable and safe for the current traffic pattern.',
        efficient: avgSpeed > 8 ? 'Keep a steady speed profile to improve fuel/energy efficiency.' : 'Current speed profile is efficient for this trip.'
    };
}

// Initialize database
initDB();

// ============ REST API ============

// Get all active devices
app.get('/api/devices', (req, res) => {
    const devices = Array.from(activeDevices.entries()).map(([id, data]) => ({
        device_id: id,
        ...data
    }));
    res.json(devices);
});

// Get device history (memory + optional DB)
app.get('/api/devices/:deviceId/history', async (req, res) => {
    const { deviceId } = req.params;
    let history = deviceHistory.get(deviceId) || [];

    if (req.query.from || req.query.to) {
        const from = req.query.from ? new Date(req.query.from).getTime() : 0;
        const to = req.query.to ? new Date(req.query.to).getTime() : Date.now();
        history = history.filter((p) => {
            const t = new Date(p.timestamp).getTime();
            return t >= from && t <= to;
        });
    }

    if (history.length === 0 && req.query.db === '1') {
        try {
            const [rows] = await pool.execute(
                `SELECT latitude as lat, longitude as lon, speed, heading, is_moving, battery_level, accuracy, timestamp
                 FROM gps_tracks WHERE device_id = ? ORDER BY timestamp DESC LIMIT 500`,
                [deviceId]
            );
            history = rows.reverse();
        } catch {
            // ignore
        }
    }

    res.json(history);
});

app.get('/api/compliance/consent/:caseId', requireAdminKey, (req, res) => {
    res.json({ logs: getConsentLogs(req.params.caseId) });
});

app.post('/api/admin/login', handleAdminLogin);

app.post('/api/admin/retention-run', requireAdminKey, async (req, res) => {
    const days = Number(req.body?.days) || Number(process.env.DATA_RETENTION_DAYS) || 30;
    const result = await runRetention(days);
    res.json({ ok: true, ...result, retention_days: days });
});

app.get('/api/fleet/summary', (req, res) => {
    const devices = Array.from(activeDevices.values());
    const moving = devices.filter(d => d.is_moving).length;
    const highRisk = devices.filter(d => toKmh(d.speed) > 50).length;
    const avgSpeed = devices.length ? devices.reduce((sum, d) => sum + (d.speed || 0), 0) / devices.length : 0;

    res.json({
        totalDevices: devices.length,
        movingDevices: moving,
        avgSpeedKmh: toKmh(avgSpeed),
        highRiskDevices: highRisk,
        onlineDevices: devices.length
    });
});

app.get('/api/analytics/route/:deviceId', (req, res) => {
    const history = deviceHistory.get(req.params.deviceId) || [];
    const distanceKm = history.length > 1
        ? history.slice(1).reduce((sum, point, index) => sum + haversineMeters(history[index].lat, history[index].lon, point.lat, point.lon), 0) / 1000
        : 0;

    res.json({
        routeId: req.params.deviceId,
        points: history.length,
        recommendation: computeRouteRecommendation(history),
        distanceKm
    });
});

app.get('/api/analytics/anomalies', (req, res) => {
    const devices = Array.from(activeDevices.values());
    const anomalies = devices
        .filter(d => toKmh(d.speed) > 50 || (d.battery_level || 100) < 20)
        .map(d => ({
            device_id: d.device_id || 'unknown',
            device_name: d.device_name || 'Unknown',
            type: toKmh(d.speed) > 50 ? 'speed' : 'battery',
            severity: toKmh(d.speed) > 80 ? 'high' : 'medium',
            value: toKmh(d.speed) > 50 ? `${toKmh(d.speed).toFixed(1)} km/h` : `${d.battery_level || 100}% battery`
        }));

    res.json({ anomalies, count: anomalies.length });
});

app.get('/api/analytics/score/:deviceId', async (req, res) => {
    const history = deviceHistory.get(req.params.deviceId) || [];
    const score = await runPythonAnalytics(history);

    res.json({
        deviceId: req.params.deviceId,
        ...score,
        points: history.length,
        recommendation: score.route_profile || computeRouteRecommendation(history)
    });
});

app.get('/api/analytics/risk-zones', (req, res) => {
    const { buildHeatmapFromHistories } = require('./intel');
    const histories = Array.from(deviceHistory.values());
    const heat = buildHeatmapFromHistories(histories);
    const zones = heat.map((point, index) => ({
        id: index + 1,
        lat: point.lat,
        lon: point.lon,
        severity: point.weight >= 4 ? 'high' : 'medium',
        label: 'İsti zona (real data)',
        weight: point.weight
    }));

    res.json({ zones, count: zones.length });
});

// Python ilə konum düzəlişi (Bakı təxmini → real region)
app.post('/api/location/resolve', async (req, res) => {
    try {
        const { latitude, longitude, accuracy, client_ip: bodyIp, hint_region: hintRegion } = req.body;
        const clientIp =
            bodyIp ||
            req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            req.socket.remoteAddress?.replace('::ffff:', '');

        const resolved = await resolveLocationWithPython(
            latitude,
            longitude,
            accuracy,
            clientIp,
            hintRegion
        );
        res.json(resolved);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Register device
app.post('/api/devices/register', async (req, res) => {
    const { device_id, name } = req.body;
    
    try {
        await pool.query(
            'INSERT INTO devices (device_id, name) VALUES ($1, $2) ON CONFLICT (device_id) DO UPDATE SET name = $2',
            [device_id, name]
        );
        res.json({ success: true, message: 'Device registered' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get device stats
app.get('/api/stats', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT
                COUNT(DISTINCT device_id) as total_devices,
                SUM(CASE WHEN is_moving = 1 THEN 1 ELSE 0 END) as moving_devices,
                AVG(speed) as avg_speed
            FROM gps_tracks
            WHERE timestamp > DATE_SUB(NOW(), INTERVAL 5 MINUTE)
        `);

        // NaN problemisə düzəlt
        const result = {
            total_devices: rows[0]?.total_devices || 0,
            moving_devices: rows[0]?.moving_devices || 0,
            avg_speed: rows[0]?.avg_speed || 0
        };
        res.json(result);
    } catch (error) {
        console.error('Stats error:', error);
        res.json({ total_devices: 0, moving_devices: 0, avg_speed: 0 });
    }
});

// City roads endpoint
app.get('/api/city/roads/:cityName', async (req, res) => {
    const { cityName } = req.params;

    if (cityRoads.has(cityName)) {
        return res.json({ city: cityName, roads: cityRoads.get(cityName) });
    }

    const roads = await getOverpassRoads(cityName);
    cityRoads.set(cityName, roads);
    res.json({ city: cityName, roads });
});

// Start vehicles simulation for city
app.post('/api/city/vehicles/:cityName', (req, res) => {
    const { cityName } = req.params;
    const { count = 30 } = req.body;

    if (vehicleIntervals.has(cityName)) {
        return res.status(400).json({ error: 'Simulation already running for this city' });
    }

    const roads = cityRoads.get(cityName) || getDefaultRoads(cityName);
    const vehicles = [];

    for (let i = 0; i < count; i++) {
        const roadIdx = Math.floor(Math.random() * roads.length);
        const pointIdx = Math.floor(Math.random() * Math.max(1, roads[roadIdx].length - 1));
        const road = roads[roadIdx];
        const point = road[pointIdx];

        vehicles.push(createVehicle(`${cityName}_${i}`, point.lat, point.lon));
    }

    cityVehicles.set(cityName, vehicles);

    const interval = setInterval(() => {
        const vList = cityVehicles.get(cityName);
        if (vList) {
            vList.forEach(v => updateVehicle(v, roads));
            io.emit('city_vehicles_update', { city: cityName, vehicles: vList });
        }
    }, 1000);

    vehicleIntervals.set(cityName, interval);
    res.json({ success: true, message: `Started ${count} vehicles for ${cityName}`, vehicles });
});

// Stop vehicles simulation
app.post('/api/city/vehicles/:cityName/stop', (req, res) => {
    const { cityName } = req.params;

    if (vehicleIntervals.has(cityName)) {
        clearInterval(vehicleIntervals.get(cityName));
        vehicleIntervals.delete(cityName);
        cityVehicles.delete(cityName);
        res.json({ success: true, message: `Stopped simulation for ${cityName}` });
    } else {
        res.status(404).json({ error: 'Simulation not running' });
    }
});
app.use(
    '/api',
    createApiRouter({
        activeDevices,
        deviceHistory,
        requireAdminKey
    })
);

// ============ WEBSOCKET (Real-time) ============
attachSocketHandlers(io, { activeDevices, deviceHistory, toKmh });

// Start server
const PORT = process.env.PORT || 3500;
server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📡 WebSocket ready for connections`);
    console.log(`🌐 CORS extras: ${EXTRA_ORIGINS.length ? EXTRA_ORIGINS.join(', ') : '(none)'}`);
    console.log(`🐍 Python location API: ${PYTHON_LOCATION_API}/resolve`);
    if (shouldSpawnLocalPython()) {
        setTimeout(() => startPythonLocationApi(), 1500);
    } else {
        console.log('🐍 Remote Python API — local spawn skipped (Render/cloud)');
    }

    const retentionDays = Number(process.env.DATA_RETENTION_DAYS) || 30;
    setInterval(() => {
        runRetention(retentionDays).then((r) => {
            if (r.deleted > 0) console.log(`🗑️ Retention: ${r.deleted} köhnə track silindi`);
        });
    }, 24 * 60 * 60 * 1000);
});