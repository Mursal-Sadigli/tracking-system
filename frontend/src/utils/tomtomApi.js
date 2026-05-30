import { calculateRoute, incidentDetailsV5 } from '@tomtom-international/web-sdk-services/esm';

const INCIDENT_ICONS = {
    0: 'Hadisə',
    1: 'Qəza',
    2: 'Duman',
    3: 'Təhlükəli yol',
    6: 'Tıxac',
    7: 'Zolaq bağlı',
    8: 'Yol bağlı',
    9: 'Yol işləri',
    11: 'Daşqın',
    14: 'Nasaz avtomobil'
};

function pointCoord(p) {
    const lat = p.latitude ?? p.lat;
    const lon = p.longitude ?? p.lon ?? p.lng;
    return [lon, lat];
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

export async function fetchTomTomIncidents(apiKey, origin, destination) {
    if (!apiKey || !origin || !destination) return [];

    try {
        const response = await incidentDetailsV5({
            key: apiKey,
            boundingBox: bboxFromPoints([origin, destination]),
            fields: {
                incidents: {
                    type: {},
                    geometry: { type: {}, coordinates: {} },
                    properties: {
                        iconCategory: {},
                        magnitudeOfDelay: {},
                        events: { description: {}, code: {}, iconCategory: {} },
                        startTime: {},
                        endTime: {}
                    }
                }
            }
        });

        const incidents = response?.incidents || [];
        return incidents.slice(0, 8).map((inc) => {
            const props = inc.properties || {};
            const event = props.events?.[0];
            const cat = event?.iconCategory ?? props.iconCategory;
            const label = event?.description || INCIDENT_ICONS[cat] || INCIDENT_ICONS[0];
            return {
                id: props.id || `${cat}-${label}`,
                label,
                delay: props.magnitudeOfDelay ?? null,
                category: INCIDENT_ICONS[cat] || 'Hadisə'
            };
        });
    } catch {
        return [];
    }
}
