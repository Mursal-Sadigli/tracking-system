import {
    calculateRoute,
    incidentDetailsV5,
    nearbySearch
} from '@tomtom-international/web-sdk-services/esm';

export const INCIDENT_TYPE = {
    ROAD_WORKS: 'road_works',
    ACCIDENT: 'accident',
    POLICE: 'police',
    DANGER: 'danger',
    CLOSED: 'closed',
    JAM: 'jam',
    RADAR: 'radar',
    OTHER: 'other'
};

const TYPE_META = {
    [INCIDENT_TYPE.ROAD_WORKS]: { emoji: '🚧', label: 'Yol işləri', color: '#f59e0b' },
    [INCIDENT_TYPE.ACCIDENT]: { emoji: '💥', label: 'Qəza', color: '#ef4444' },
    [INCIDENT_TYPE.POLICE]: { emoji: '🚓', label: 'Polis əməliyyatı', color: '#3b82f6' },
    [INCIDENT_TYPE.DANGER]: { emoji: '⚠️', label: 'Təhlükəli ərazi', color: '#f97316' },
    [INCIDENT_TYPE.CLOSED]: { emoji: '🚫', label: 'Bağlı yol', color: '#dc2626' },
    [INCIDENT_TYPE.JAM]: { emoji: '🚦', label: 'Tıxac', color: '#eab308' },
    [INCIDENT_TYPE.RADAR]: { emoji: '📡', label: 'Radar', color: '#a855f7' },
    [INCIDENT_TYPE.OTHER]: { emoji: 'ℹ️', label: 'Hadisə', color: '#94a3b8' }
};

const POLICE_KEYWORDS = [
    'police',
    'polis',
    'patrol',
    'checkpoint',
    'control',
    'əməliyyat',
    'emeliyyat',
    'law enforcement'
];

const RADAR_KEYWORDS = [
    'speed camera',
    'radar',
    'fixed camera',
    'mobile camera',
    'enforcement camera',
    'sürət kamerası',
    'suret kamerasi'
];

function pointCoord(p) {
    const lat = p.latitude ?? p.lat;
    const lon = p.longitude ?? p.lon ?? p.lng;
    return [lon, lat];
}

function geometryCenter(geometry) {
    if (!geometry?.coordinates?.length) return null;
    if (geometry.type === 'Point') {
        const [lon, lat] = geometry.coordinates;
        return { lat, lon };
    }
    const ring =
        geometry.type === 'LineString'
            ? geometry.coordinates
            : geometry.coordinates.flat?.() || geometry.coordinates[0] || [];
    if (!ring.length) return null;
    const mid = ring[Math.floor(ring.length / 2)];
    return { lat: mid[1], lon: mid[0] };
}

function lineCoords(geometry) {
    if (!geometry?.coordinates?.length) return [];
    if (geometry.type === 'LineString') return geometry.coordinates;
    if (geometry.type === 'MultiLineString') {
        return geometry.coordinates.flat();
    }
    return [];
}

function classifyIncident(props, description = '') {
    const text = `${description} ${props.from || ''} ${props.to || ''}`.toLowerCase();
    if (POLICE_KEYWORDS.some((k) => text.includes(k))) {
        return INCIDENT_TYPE.POLICE;
    }
    if (RADAR_KEYWORDS.some((k) => text.includes(k))) {
        return INCIDENT_TYPE.RADAR;
    }

    const cat = props.events?.[0]?.iconCategory ?? props.iconCategory;
    switch (cat) {
        case 1:
            return INCIDENT_TYPE.ACCIDENT;
        case 9:
            return INCIDENT_TYPE.ROAD_WORKS;
        case 8:
        case 7:
            return INCIDENT_TYPE.CLOSED;
        case 3:
        case 2:
        case 11:
            return INCIDENT_TYPE.DANGER;
        case 6:
            return INCIDENT_TYPE.JAM;
        default:
            return INCIDENT_TYPE.OTHER;
    }
}

export function incidentMeta(type) {
    return TYPE_META[type] || TYPE_META[INCIDENT_TYPE.OTHER];
}

export function summarizeIncidents(incidents = []) {
    const counts = {};
    incidents.forEach((inc) => {
        counts[inc.type] = (counts[inc.type] || 0) + 1;
    });
    return Object.entries(counts)
        .map(([type, count]) => ({ type, count, ...incidentMeta(type) }))
        .sort((a, b) => b.count - a.count);
}

export function resolveEndpoints(devices, selectedDevice, userLocation) {
    const destinationDevice =
        selectedDevice?.lat != null
            ? selectedDevice
            : devices.find((d) => d.lat != null && d.lon != null);

    const destination = destinationDevice
        ? {
              lat: destinationDevice.lat,
              lon: destinationDevice.lon,
              label: destinationDevice.device_name || destinationDevice.device_id || 'Subyekt'
          }
        : null;

    let origin = null;
    if (userLocation?.lat != null && userLocation?.lon != null) {
        origin = { lat: userLocation.lat, lon: userLocation.lon, label: 'Operator' };
    } else if (destinationDevice) {
        const others = devices.filter(
            (d) =>
                d.lat != null &&
                d.lon != null &&
                d.device_id !== destinationDevice.device_id
        );
        if (others.length) {
            origin = {
                lat: others[0].lat,
                lon: others[0].lon,
                label: others[0].device_name || others[0].device_id || 'Operator'
            };
        }
    }

    return { origin, destination };
}

export function routeToLineCoords(route) {
    if (!route?.legs?.length) return [];
    return route.legs.flatMap((leg) => (leg.points || []).map(pointCoord));
}

export function parseRoutes(response) {
    const routes = response?.routes || [];
    return routes.map((route, index) => ({
        index,
        summary: route.summary || {},
        travelTimeInSeconds: route.summary?.travelTimeInSeconds ?? null,
        trafficDelayInSeconds: route.summary?.trafficDelayInSeconds ?? 0,
        lengthInMeters: route.summary?.lengthInMeters ?? null,
        coords: routeToLineCoords(route)
    }));
}

export async function fetchTomTomRoutes(apiKey, origin, destination, maxAlternatives = 2) {
    if (!apiKey || !origin || !destination) return [];

    const response = await calculateRoute({
        key: apiKey,
        locations: [
            { latitude: origin.lat, longitude: origin.lon },
            { latitude: destination.lat, longitude: destination.lon }
        ],
        travelMode: 'car',
        traffic: true,
        maxAlternatives,
        routeType: 'fastest',
        departAt: 'now'
    });

    const parsed = parseRoutes(response);
    parsed.sort((a, b) => (a.travelTimeInSeconds || 0) - (b.travelTimeInSeconds || 0));
    return parsed;
}

function bboxFromCenter(center, pad = 0.08) {
    return {
        minLon: center.lon - pad,
        minLat: center.lat - pad,
        maxLon: center.lon + pad,
        maxLat: center.lat + pad
    };
}

function bboxFromPoints(points, pad = 0.04) {
    const lats = points.map((p) => p.lat);
    const lons = points.map((p) => p.lon);
    return {
        minLon: Math.min(...lons) - pad,
        minLat: Math.min(...lats) - pad,
        maxLon: Math.max(...lons) + pad,
        maxLat: Math.max(...lats) + pad
    };
}

function parseIncidentFeature(inc, source = 'traffic') {
    const props = inc.properties || {};
    const event = props.events?.[0];
    const description = event?.description || props.from || '';
    const type = classifyIncident(props, description);
    const meta = incidentMeta(type);
    const center = geometryCenter(inc.geometry);
    const lines = lineCoords(inc.geometry);

    return {
        id: props.id || `${source}-${type}-${center?.lat}-${center?.lon}`,
        type,
        emoji: meta.emoji,
        label: meta.label,
        description: description || meta.label,
        color: meta.color,
        delay: props.magnitudeOfDelay ?? null,
        from: props.from || null,
        to: props.to || null,
        lat: center?.lat ?? null,
        lon: center?.lon ?? null,
        lines,
        source
    };
}

export function bboxFromMap(map, pad = 0.015) {
    if (!map?.getBounds) return null;
    const b = map.getBounds();
    return {
        minLon: b.getWest() - pad,
        minLat: b.getSouth() - pad,
        maxLon: b.getEast() + pad,
        maxLat: b.getNorth() + pad
    };
}

export async function fetchTomTomIncidents(apiKey, origin, destination, center, bboxOverride) {
    if (!apiKey) return [];

    const points = [origin, destination, center].filter((p) => p?.lat != null && p?.lon != null);
    if (!points.length && !bboxOverride) return [];

    try {
        const boundingBox =
            bboxOverride ||
            (points.length >= 2
                ? bboxFromPoints(points, 0.06)
                : bboxFromCenter(points[0] || center, 0.08));

        const response = await incidentDetailsV5({
            key: apiKey,
            boundingBox,
            language: 'az-AZ',
            timeValidityFilter: 'present',
            fields: {
                incidents: {
                    type: {},
                    geometry: { type: {}, coordinates: {} },
                    properties: {
                        id: {},
                        iconCategory: {},
                        magnitudeOfDelay: {},
                        from: {},
                        to: {},
                        events: { description: {}, code: {}, iconCategory: {} },
                        startTime: {},
                        endTime: {}
                    }
                }
            }
        });

        const incidents = (response?.incidents || [])
            .map((inc) => parseIncidentFeature(inc, 'traffic'))
            .filter((inc) => inc.lat != null || inc.lines.length);

        return dedupeIncidents(incidents).slice(0, 60);
    } catch (err) {
        console.warn('TomTom hadisə API:', err?.message || err);
        return [];
    }
}

function isRadarPoi(result) {
    const parts = [
        ...(result.poi?.categories || []),
        ...(result.poi?.classifications?.map((c) => c.code) || []),
        result.poi?.name || '',
        result.address?.freeformAddress || ''
    ]
        .join(' ')
        .toLowerCase();
    if (
        parts.includes('electric vehicle') ||
        parts.includes('charging') ||
        parts.includes('ev station')
    ) {
        return false;
    }
    return (
        parts.includes('camera') ||
        parts.includes('radar') ||
        parts.includes('enforcement') ||
        parts.includes('monitoring') ||
        parts.includes('speed')
    );
}

export async function fetchTomTomRadars(apiKey, center) {
    if (!apiKey || !center?.lat) return [];

    const queries = ['speed camera', 'traffic enforcement', 'radar', 'fixed camera'];
    const merged = [];

    try {
        for (const query of queries) {
            const response = await nearbySearch({
                key: apiKey,
                lat: center.lat,
                lon: center.lon,
                radius: 18000,
                limit: 15,
                query,
                language: 'az-AZ'
            });
            (response?.results || []).forEach((r) => {
                if (!isRadarPoi(r)) return;
                const pos = r.position;
                if (!pos) return;
                const meta = incidentMeta(INCIDENT_TYPE.RADAR);
                merged.push({
                    id: `radar-${r.id || `${pos.lat}-${pos.lon}`}`,
                    type: INCIDENT_TYPE.RADAR,
                    emoji: meta.emoji,
                    label: meta.label,
                    description: r.poi?.name || r.address?.freeformAddress || 'Sürət kamerası',
                    color: meta.color,
                    delay: null,
                    from: null,
                    to: null,
                    lat: pos.lat,
                    lon: pos.lon,
                    lines: [],
                    source: 'search'
                });
            });
        }
        return dedupeIncidents(merged).slice(0, 25);
    } catch (err) {
        console.warn('TomTom radar axtarışı:', err?.message || err);
        return [];
    }
}

function dedupeIncidents(list) {
    const seen = new Set();
    return list.filter((inc) => {
        const key = `${inc.type}-${inc.lat?.toFixed(4)}-${inc.lon?.toFixed(4)}-${inc.description?.slice(0, 30)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export async function fetchTomTomTrafficEvents(apiKey, origin, destination, center, bboxOverride) {
    const traffic = await fetchTomTomIncidents(apiKey, origin, destination, center, bboxOverride);
    return traffic
        .filter((inc) => inc.type !== INCIDENT_TYPE.RADAR)
        .slice(0, 50);
}
