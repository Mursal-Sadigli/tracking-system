import { apiGet } from '../api';
import { fetchTomTomRadars } from './tomtomApi';

export function haversineM(a, b) {
    if (!a?.lat || !b?.lat) return Infinity;
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
}

function normalizeTomTomRadar(inc) {
    return {
        id: inc.id || `tomtom-${inc.lat}-${inc.lon}`,
        lat: inc.lat,
        lon: inc.lon,
        limitKmh: inc.limitKmh ?? null,
        kind: inc.kind || 'unknown',
        source: 'tomtom',
        description: inc.description || 'Sürət kamerası'
    };
}

function normalizeOsmRadar(r) {
    return {
        id: r.id,
        lat: r.lat,
        lon: r.lon,
        limitKmh: r.limitKmh ?? null,
        kind: r.kind || 'fixed',
        source: 'osm',
        description: r.description || 'Sürət kamerası'
    };
}

export function mergeRadars(tomtomList = [], osmList = [], dedupeM = 80) {
    const merged = [...osmList.map(normalizeOsmRadar)];

    for (const raw of tomtomList) {
        const t = normalizeTomTomRadar(raw);
        const dup = merged.some((r) => haversineM(r, t) < dedupeM);
        if (!dup) merged.push(t);
    }

    return merged;
}

export async function fetchOsmRadars(bbox) {
    if (!bbox) return [];
    const { minLon, minLat, maxLon, maxLat } = bbox;
    try {
        const data = await apiGet(
            `/api/nav/radars?bbox=${minLon},${minLat},${maxLon},${maxLat}`,
            { admin: true }
        );
        return (data.radars || []).map(normalizeOsmRadar);
    } catch (err) {
        console.warn('OSM radar API:', err?.message || err);
        return [];
    }
}

export async function fetchSpeedLimit(lat, lon) {
    if (lat == null || lon == null) return { limitKmh: null, source: 'unknown' };
    try {
        return await apiGet(`/api/nav/speed-limit?lat=${lat}&lon=${lon}`, { admin: true });
    } catch (err) {
        console.warn('Sürət limiti API:', err?.message || err);
        return { limitKmh: null, source: 'unknown' };
    }
}

export async function fetchAllRadars(apiKey, center, bbox) {
    const queryCenter = center || null;
    const bboxForOsm =
        bbox ||
        (queryCenter
            ? {
                  minLon: queryCenter.lon - 0.06,
                  minLat: queryCenter.lat - 0.06,
                  maxLon: queryCenter.lon + 0.06,
                  maxLat: queryCenter.lat + 0.06
              }
            : null);

    const [osm, tomtomRaw] = await Promise.all([
        fetchOsmRadars(bboxForOsm),
        fetchTomTomRadars(apiKey, queryCenter)
    ]);

    return mergeRadars(tomtomRaw, osm);
}
