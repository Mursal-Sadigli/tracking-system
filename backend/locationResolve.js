const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const axios = require('axios');
const { reverseGeocodePlace } = require('./geocodePlace');

const PYTHON_LOCATION_API = process.env.PYTHON_LOCATION_API || 'http://127.0.0.1:5001';
const PYTHON_SERVICE_DIR = path.join(__dirname, '..', 'python-service');
const locationResolveCache = new Map();
const LOCATION_CACHE_MS = 8000;

function isPrivateIp(ip) {
    const raw = String(ip || '').trim().replace('::ffff:', '');
    if (!raw || raw === '127.0.0.1' || raw === '::1' || raw === 'localhost') return true;
    const m = raw.match(/^(\d+)\.(\d+)\./);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
}

/** Subyekt LAN-dan qoşulanda telefonun öz public IP-si (ipify) üstünlük verilir. */
function pickClientIpForResolve(publicIp, socketIp) {
    const pub = String(publicIp || '').trim();
    if (pub && !isPrivateIp(pub)) return pub;
    const sock = String(socketIp || '').trim();
    if (sock && !isPrivateIp(sock)) return sock;
    return null;
}

function getPythonExecutable() {
    const venvPython = path.join(PYTHON_SERVICE_DIR, 'venv', 'Scripts', 'python.exe');
    if (fs.existsSync(venvPython)) return venvPython;
    return process.env.PYTHON_BIN || 'python';
}

async function resolveLocationWithPython(
    latitude,
    longitude,
    accuracy,
    clientIp,
    hintRegion,
    options = {}
) {
    const trustBrowserGps = options.trustBrowserGps === true;
    const cacheKey = `${Number(latitude).toFixed(3)}_${Number(longitude).toFixed(3)}_${clientIp || 'noip'}_${hintRegion || ''}_t${trustBrowserGps ? 1 : 0}`;
    const cached = locationResolveCache.get(cacheKey);
    if (cached && Date.now() - cached.at < LOCATION_CACHE_MS) {
        return cached.result;
    }

    const payload = {
        latitude: Number(latitude),
        longitude: Number(longitude),
        accuracy: accuracy != null ? Number(accuracy) : null,
        client_ip: clientIp || null,
        hint_region: hintRegion || null,
        trust_browser_gps: trustBrowserGps
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
                { encoding: 'utf8',
                  timeout: 6000,
                  cwd: PYTHON_SERVICE_DIR }
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
            country: '',
            region: 'unknown',
            location_quality: 'approximate',
            reason: 'python_unavailable'
        };
    }

    if (payload.latitude != null && payload.longitude != null) {
        const place = await reverseGeocodePlace(payload.latitude, payload.longitude);
        if (place.display_line || place.city) {
            result.city = place.display_line || place.city;
            result.browser_city = place.city;
            result.display_line = place.display_line;
            result.district = place.district;
            result.region = place.region_key || result.region;
            result.region_label = place.region_label;
            result.geocode_source = place.source;
        }
        if (place.country && !result.country) result.country = place.country;
    }

    locationResolveCache.set(cacheKey, { at: Date.now(), result });
    return result;
}

async function resolvePlaceFromGps(latitude, longitude, accuracy) {
    const place = await reverseGeocodePlace(latitude, longitude);
    const resolved = await resolveLocationWithPython(latitude, longitude, accuracy, null, null, {
        trustBrowserGps: true
    });
    return {
        ...resolved,
        latitude: resolved.latitude,
        longitude: resolved.longitude,
        city: place.display_line || place.city,
        browser_city: place.city,
        display_line: place.display_line,
        district: place.district,
        suburb: place.suburb,
        country: place.country || resolved.country,
        region: place.region_key || resolved.region,
        region_label: place.region_label,
        geocode_source: place.source
    };
}

/** @deprecated use reverseGeocodePlace */
async function reverseGeocodeNominatim(lat, lon) {
    const p = await reverseGeocodePlace(lat, lon);
    return { city: p.city, country: p.country, region: p.region_key };
}

module.exports = {
    resolveLocationWithPython,
    resolvePlaceFromGps,
    pickClientIpForResolve,
    isPrivateIp,
    reverseGeocodeNominatim,
    reverseGeocodePlace
};
