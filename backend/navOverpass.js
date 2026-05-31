const axios = require('axios');

const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY || process.env.REACT_APP_TOMTOM_API_KEY || '';

const radarCache = new Map();
const speedCache = new Map();
const RADAR_CACHE_TTL_MS = 5 * 60 * 1000;
const SPEED_CACHE_TTL_MS = 30 * 1000;

function cacheGet(map, key) {
    const entry = map.get(key);
    if (!entry) return null;
    if (Date.now() - entry.at > entry.ttl) {
        map.delete(key);
        return null;
    }
    return entry.value;
}

function cacheSet(map, key, value, ttl) {
    map.set(key, { at: Date.now(), ttl, value });
}

function bboxKey(minLon, minLat, maxLon, maxLat) {
    return `${minLon.toFixed(3)},${minLat.toFixed(3)},${maxLon.toFixed(3)},${maxLat.toFixed(3)}`;
}

function speedKey(lat, lon) {
    return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function parseMaxspeed(raw) {
    if (raw == null || raw === '') return null;
    const s = String(raw).trim().toLowerCase();
    if (s === 'none' || s === 'signals') return null;
    const mph = s.match(/^(\d+(?:\.\d+)?)\s*mph$/);
    if (mph) return Math.round(Number(mph[1]) * 1.60934);
    const kmh = s.match(/^(\d+(?:\.\d+)?)\s*km\/?h$/);
    if (kmh) return Math.round(Number(kmh[1]));
    const num = s.match(/^(\d+(?:\.\d+)?)$/);
    if (num) return Math.round(Number(num[1]));
    return null;
}

async function queryOverpass(overpassQuery, timeoutMs = 12000) {
    const response = await axios.post(OVERPASS_URL, overpassQuery, {
        timeout: timeoutMs,
        headers: { 'Content-Type': 'text/plain' },
        responseType: 'json'
    });
    return response.data?.elements || [];
}

function normalizeRadarNode(el) {
    const tags = el.tags || {};
    const lat = el.lat;
    const lon = el.lon;
    if (lat == null || lon == null) return null;

    let kind = 'fixed';
    if (tags['camera:type'] === 'mobile' || tags.enforcement === 'maxspeed') {
        kind = tags['camera:type'] === 'mobile' ? 'mobile' : kind;
    }

    const limitKmh =
        parseMaxspeed(tags.maxspeed) ||
        parseMaxspeed(tags['maxspeed:forward']) ||
        parseMaxspeed(tags['maxspeed:backward']);

    return {
        id: `osm-${el.type}-${el.id}`,
        lat,
        lon,
        limitKmh,
        kind,
        source: 'osm',
        description: tags.name || tags.ref || 'Sürət kamerası'
    };
}

async function getRadarsInBbox(minLon, minLat, maxLon, maxLat) {
    const key = bboxKey(minLon, minLat, maxLon, maxLat);
    const cached = cacheGet(radarCache, key);
    if (cached) return cached;

    const query = `[bbox:${minLat},${minLon},${maxLat},${maxLon}];
(
  node["highway"="speed_camera"];
  node["enforcement"="maxspeed"];
  node["man_made"="surveillance"]["surveillance:type"="speed_camera"];
);
out body;`;

    try {
        const elements = await queryOverpass(query);
        const radars = elements
            .map(normalizeRadarNode)
            .filter(Boolean);

        const deduped = [];
        const seen = new Set();
        for (const r of radars) {
            const k = `${r.lat.toFixed(5)},${r.lon.toFixed(5)}`;
            if (seen.has(k)) continue;
            seen.add(k);
            deduped.push(r);
        }

        cacheSet(radarCache, key, deduped, RADAR_CACHE_TTL_MS);
        return deduped;
    } catch (err) {
        console.warn('Overpass radar sorğusu:', err?.message || err);
        return [];
    }
}

async function getOsmSpeedLimit(lat, lon) {
    const query = `[out:json][timeout:12];
(
  way(around:45,${lat},${lon})["highway"]["maxspeed"];
  way(around:45,${lat},${lon})["highway"]["maxspeed:advisory"];
);
out tags 5;`;

    try {
        const elements = await queryOverpass(query, 10000);
        for (const el of elements) {
            const tags = el.tags || {};
            const limit =
                parseMaxspeed(tags.maxspeed) ||
                parseMaxspeed(tags['maxspeed:advisory']) ||
                parseMaxspeed(tags['maxspeed:forward']);
            if (limit != null) {
                return { limitKmh: limit, source: 'osm' };
            }
        }
    } catch (err) {
        console.warn('Overpass maxspeed sorğusu:', err?.message || err);
    }
    return null;
}

async function getTomTomSpeedLimit(lat, lon) {
    if (!TOMTOM_API_KEY) return null;

    try {
        const url = `https://api.tomtom.com/search/2/reverseGeocode/${lat},${lon}.json`;
        const response = await axios.get(url, {
            timeout: 8000,
            params: {
                key: TOMTOM_API_KEY,
                returnSpeedLimit: true
            }
        });

        const addresses = response.data?.addresses || [];
        for (const addr of addresses) {
            const limit = addr.address?.speedLimit;
            if (limit != null && !Number.isNaN(Number(limit))) {
                return { limitKmh: Math.round(Number(limit)), source: 'tomtom' };
            }
        }
    } catch (err) {
        console.warn('TomTom speed limit:', err?.message || err);
    }
    return null;
}

async function getSpeedLimitAt(lat, lon) {
    const key = speedKey(lat, lon);
    const cached = cacheGet(speedCache, key);
    if (cached) return cached;

    const osm = await getOsmSpeedLimit(lat, lon);
    if (osm) {
        cacheSet(speedCache, key, osm, SPEED_CACHE_TTL_MS);
        return osm;
    }

    const tomtom = await getTomTomSpeedLimit(lat, lon);
    if (tomtom) {
        cacheSet(speedCache, key, tomtom, SPEED_CACHE_TTL_MS);
        return tomtom;
    }

    const unknown = { limitKmh: null, source: 'unknown' };
    cacheSet(speedCache, key, unknown, SPEED_CACHE_TTL_MS);
    return unknown;
}

function parseBboxParam(bboxStr) {
    if (!bboxStr || typeof bboxStr !== 'string') return null;
    const parts = bboxStr.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return null;
    const [minLon, minLat, maxLon, maxLat] = parts;
    if (minLat >= maxLat || minLon >= maxLon) return null;
    if (maxLat - minLat > 0.5 || maxLon - minLon > 0.5) return null;
    return { minLon, minLat, maxLon, maxLat };
}

module.exports = {
    getRadarsInBbox,
    getSpeedLimitAt,
    parseBboxParam,
    parseMaxspeed
};
