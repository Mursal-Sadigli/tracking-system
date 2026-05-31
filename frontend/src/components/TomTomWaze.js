import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import tt from '@tomtom-international/web-sdk-maps';

import '@tomtom-international/web-sdk-maps/dist/maps.css';

import { TOMTOM_API_KEY, TOMTOM_MAP_LANGUAGE } from '../config';

import { movedEnough } from '../utils/mapFormat';

import {
    fetchTomTomTrafficEvents,
    summarizeIncidents,
    INCIDENT_TYPE,
    bboxFromMap,
    resolveEndpoints
} from '../utils/tomtomApi';

import { useTomTomRoutes } from '../hooks/useTomTomRoutes';

import RouteEtaPanel from './RouteEtaPanel';
import { zoneTypeMeta } from '../utils/geofenceConstants';

import { fetchAllRadars, fetchSpeedLimit } from '../utils/radarApi';

import { useRadarAlerts, getRadarSoundEnabled, setRadarSoundEnabled } from '../hooks/useRadarAlerts';

import SpeedLimitHud from './SpeedLimitHud';

import { wazeUrl } from '../geolocation';

import './TomTomWaze.css';
import './RouteEtaPanel.css';
import './SpeedLimitHud.css';



const ROUTE_COLORS = ['#22d3ee', '#a78bfa', '#fbbf24'];
const NAV_TRACKING_ZOOM = 18;
const NAV_STYLE_ZOOM_THRESHOLD = 14;
const NAV_PITCH = 55;
const NAV_LABEL_FONT =
    '"Noto Sans", "Noto Sans Arabic", "Noto Sans Armenian", "Noto Sans Georgian", Arial Unicode MS, sans-serif';
const NAV_FALLBACK_CENTER = { lat: 40.4093, lon: 49.8671 };

function navPitchForView(viewMode) {
    return viewMode === '2d' ? 0 : NAV_PITCH;
}

/** Waze nav: basic driving — tam rəngli xəritə + küçə adları (hybrid torpaq polygonu göstərmir) */
const NAV_MAP_STYLE = {
    map: '2/basic_street-light-driving',
    poi: '2/poi_light',
    trafficIncidents: '2/incidents_light',
    trafficFlow: '2/flow_relative-light'
};

function isShieldOrRouteLayer(layerId) {
    return /shield|route.?number|road.?number|icon.?text|milestone|reference|ref.?number|exit.?number|junction/i.test(
        layerId
    );
}

function isStreetNameLabelLayer(layer) {
    if (!layer?.id || layer.type !== 'symbol') return false;
    if (isShieldOrRouteLayer(layer.id)) return false;
    const src = layer.source || '';
    const fromTiles =
        src === 'vectorTiles' || src === 'poiTiles' || src === 'labelTiles' || /label/i.test(src);
    if (!fromTiles) return false;
    return /label|street|road.?name|local|place|name|address|city|town|village|hamlet|suburb|district|quarter|neighbour|poi/i.test(
        layer.id
    );
}

function reinforceTomTomLabels(map) {
    if (!hasTomTomStyleLoaded(map)) return;
    for (const layer of map.getStyle()?.layers || []) {
        if (!isStreetNameLabelLayer(layer)) continue;
        try {
            map.setLayoutProperty(layer.id, 'visibility', 'visible');
            map.setPaintProperty(layer.id, 'text-opacity', 1);
            map.setPaintProperty(layer.id, 'icon-opacity', 1);
            if (typeof map.setLayerZoomRange === 'function') {
                map.setLayerZoomRange(layer.id, 10, 24);
            }
        } catch {
            /* layer may not expose these properties */
        }
    }
}

function activateTrafficLayersOnce(map) {
    if (!hasTomTomStyleLoaded(map) || map.__ttNavTrafficOn) return;
    map.showTrafficFlow();
    map.showTrafficIncidents();
    map.showPOI();
    map.__ttNavTrafficOn = true;
}

function applyTomTomNavLayers(map, { onReady, withTraffic = false } = {}) {
    if (!hasTomTomStyleLoaded(map)) return;
    if (withTraffic) activateTrafficLayersOnce(map);
    const finish = () => {
        reinforceTomTomLabels(map);
        ensureMapLabelsVisible(map);
        onReady?.();
    };
    if (map.isStyleLoaded?.() && !map.isMoving?.()) {
        finish();
        return;
    }
    map.once('idle', finish);
}

function refreshNavLayers(map, afterReady) {
    applyTomTomNavLayers(map, { onReady: afterReady });
}

function resolveNavCenter({ centerLat, centerLon, origin, destination, map }) {
    if (centerLat != null && centerLon != null) return { lat: centerLat, lon: centerLon };
    if (origin?.lat != null) return { lat: origin.lat, lon: origin.lon };
    if (destination?.lat != null) return { lat: destination.lat, lon: destination.lon };
    if (map && map.getZoom() >= NAV_STYLE_ZOOM_THRESHOLD) {
        const c = map.getCenter();
        return { lat: c.lat, lon: c.lng };
    }
    return NAV_FALLBACK_CENTER;
}

function hasTomTomStyleLoaded(map) {
    return Boolean(map?.getStyle?.()?.sources?.vectorTiles);
}

function isTomTomLabelLayer(layer) {
    if (!layer?.id) return false;
    if (isShieldOrRouteLayer(layer.id)) return false;
    const src = layer.source || '';
    const fromTiles =
        src === 'vectorTiles' ||
        src === 'poiTiles' ||
        src === 'labelTiles' ||
        /label/i.test(src);
    if (layer.type === 'symbol' && fromTiles && isStreetNameLabelLayer(layer)) return true;
    return false;
}

function ensureMapLabelsVisible(map) {
    try {
        const layers = map.getStyle()?.layers;
        if (!layers?.length) return;
        for (const layer of layers) {
            if (!isTomTomLabelLayer(layer)) continue;
            try {
                map.setLayoutProperty(layer.id, 'visibility', 'visible');
                if (layer.type === 'symbol') {
                    map.setPaintProperty(layer.id, 'text-opacity', 1);
                    map.setPaintProperty(layer.id, 'icon-opacity', 1);
                }
            } catch {
                /* layer may not expose these properties */
            }
        }
    } catch {
        /* style not ready */
    }
}

function whenTomTomStyleReady(map, onReady) {
    let readyCalled = false;
    const finish = () => {
        if (readyCalled || !hasTomTomStyleLoaded(map)) return;
        readyCalled = true;
        map.resize();
        applyTomTomNavLayers(map, { withTraffic: true, onReady: () => onReady?.(map) });
    };
    const tick = () => {
        if (hasTomTomStyleLoaded(map) && map.isStyleLoaded?.()) {
            finish();
        }
    };
    map.on('load', tick);
    map.on('idle', tick);
    map.on('styledata', tick);
    [400, 1200, 2500].forEach((ms) => window.setTimeout(tick, ms));
}

function applyViewPitch(map, viewMode) {
    const pitch = navPitchForView(viewMode);
    if (typeof map.setMaxPitch === 'function') {
        map.setMaxPitch(viewMode === '2d' ? 0 : 60);
    }
    if (typeof map.setPitch === 'function') {
        map.setPitch(pitch);
        return;
    }
    map.easeTo({ pitch, duration: 650 });
}

function ensureNavWazeView(map, viewMode, center, afterLoad) {
    const pitch = navPitchForView(viewMode);
    if (typeof map.setMaxPitch === 'function') {
        map.setMaxPitch(viewMode === '2d' ? 0 : 60);
    }

    map.flyTo({
        center: [center.lon, center.lat],
        zoom: NAV_TRACKING_ZOOM,
        pitch,
        duration: 900
    });
    map.once('moveend', () => {
        reinforceTomTomLabels(map);
        ensureMapLabelsVisible(map);
        afterLoad?.();
    });
}

function hasTrackingAnchor({ centerLat, centerLon, origin, destination }) {
    if (centerLat != null && centerLon != null) return true;
    if (origin?.lat != null || destination?.lat != null) return true;
    return false;
}



function createMarkerElement(kind, label) {

    const el = document.createElement('div');

    el.className = `tomtom-waze-marker tomtom-waze-marker--${kind}`;

    el.textContent = label;

    el.title = kind === 'operator' ? 'Operator' : 'Subyekt';

    return el;

}

function createRadarMarker(radar) {
    const el = document.createElement('div');
    el.className = 'tomtom-radar-marker';
    const limit = radar.limitKmh != null ? ` • ${radar.limitKmh} km/s` : '';
    el.title = `${radar.description || 'Sürət kamerası'}${limit}`;
    el.innerHTML = '<span class="tomtom-radar-marker__icon" aria-hidden="true">📷</span>';
    return el;
}

function createIncidentMarker(incident) {

    const el = document.createElement('div');

    el.className = `tomtom-incident-marker tomtom-incident-marker--${incident.type}`;

    el.textContent = incident.emoji;

    el.title = incident.description;

    return el;

}



export default function TomTomWaze({
    devices = [],
    selectedDevice,
    userLocation,
    centerLat,
    centerLon,
    operatorSpeedKmh,
    navigationMode = false,
    viewMode: viewModeProp,
    routes: controlledRoutes,
    selectedRouteIdx: controlledSelectedRouteIdx,
    onSelectRoute,
    loadingRoutes: controlledLoadingRoutes,
    routeError: controlledRouteError,
    geofences = []
}) {

    const [viewMode, setViewMode] = useState(viewModeProp || '2d');

    const mapContainerRef = useRef(null);

    const mapRef = useRef(null);

    const markersRef = useRef([]);

    const incidentMarkersRef = useRef([]);

    const radarMarkersRef = useRef([]);

    const routeLayerIdsRef = useRef([]);

    const geofenceLayerIdsRef = useRef([]);

    const incidentLayerIdsRef = useRef([]);

    const lastIncidentFetchRef = useRef({ at: 0, centerKey: '' });
    const lastRadarFetchRef = useRef({ at: 0, centerKey: '' });
    const incidentsRef = useRef([]);
    const radarsRef = useRef([]);
    const loadIncidentsRef = useRef(() => {});
    const loadRadarsRef = useRef(() => {});
    const redrawIncidentsRef = useRef(() => {});
    const suppressViewportReloadRef = useRef(false);
    const suppressViewportTimerRef = useRef(null);
    const lastMapFollowRef = useRef(null);
    const lastSpeedLimitPosRef = useRef(null);
    const operatorMarkerRef = useRef(null);
    const subjectMarkerRef = useRef(null);

    const [mapReady, setMapReady] = useState(false);

    const [incidents, setIncidents] = useState([]);

    const [loadingIncidents, setLoadingIncidents] = useState(false);

    const [incidentsOpen, setIncidentsOpen] = useState(true);

    const [radars, setRadars] = useState([]);

    const [loadingRadars, setLoadingRadars] = useState(false);

    const [speedLimit, setSpeedLimit] = useState({ limitKmh: null, source: 'unknown' });

    const [radarSoundOn, setRadarSoundOn] = useState(() => getRadarSoundEnabled());



    const { origin, destination } = useMemo(
        () => resolveEndpoints(devices, selectedDevice, userLocation),
        [devices, selectedDevice, userLocation]
    );

    const isControlledRoutes = controlledRoutes !== undefined;
    const internalRoutes = useTomTomRoutes(origin, destination, {
        enabled: !isControlledRoutes
    });

    const routes = isControlledRoutes ? controlledRoutes : internalRoutes.routes;
    const selectedRouteIdx = isControlledRoutes
        ? (controlledSelectedRouteIdx ?? 0)
        : internalRoutes.selectedRouteIdx;
    const setSelectedRouteIdx = isControlledRoutes
        ? (idx) => onSelectRoute?.(idx)
        : internalRoutes.setSelectedRouteIdx;
    const loadingRoutes = isControlledRoutes
        ? (controlledLoadingRoutes ?? false)
        : internalRoutes.loadingRoutes;
    const routeError = isControlledRoutes
        ? (controlledRouteError ?? '')
        : internalRoutes.routeError;

    const originLat = origin?.lat;
    const originLon = origin?.lon;
    const destinationLat = destination?.lat;
    const destinationLon = destination?.lon;

    const markProgrammaticMove = useCallback((durationMs = 900) => {
        suppressViewportReloadRef.current = true;
        clearTimeout(suppressViewportTimerRef.current);
        suppressViewportTimerRef.current = window.setTimeout(() => {
            suppressViewportReloadRef.current = false;
        }, durationMs + 150);
    }, []);



    const mapCenter = useMemo(() => {
        if (centerLat != null && centerLon != null) return { lat: centerLat, lon: centerLon };
        if (destination) return { lat: destination.lat, lon: destination.lon };
        if (origin) return { lat: origin.lat, lon: origin.lon };
        if (navigationMode) return NAV_FALLBACK_CENTER;
        return { lat: 40.4093, lon: 49.8671 };
    }, [centerLat, centerLon, destination, origin, navigationMode]);

    const trackingActive = useMemo(
        () => hasTrackingAnchor({ centerLat, centerLon, origin, destination }),
        [centerLat, centerLon, origin, destination]
    );



    const incidentSummary = useMemo(() => summarizeIncidents(incidents), [incidents]);



    const clearRouteLayers = useCallback((map) => {

        routeLayerIdsRef.current.forEach((id) => {

            if (map.getLayer(id)) map.removeLayer(id);

            if (map.getSource(id)) map.removeSource(id);

        });

        routeLayerIdsRef.current = [];

    }, []);

    const clearGeofenceLayers = useCallback((map) => {
        geofenceLayerIdsRef.current.forEach((id) => {
            if (map.getLayer(`${id}-fill`)) map.removeLayer(`${id}-fill`);
            if (map.getLayer(`${id}-line`)) map.removeLayer(`${id}-line`);
            if (map.getSource(id)) map.removeSource(id);
        });
        geofenceLayerIdsRef.current = [];
    }, []);



    const clearIncidentLayers = useCallback((map) => {

        incidentLayerIdsRef.current.forEach((id) => {

            if (map.getLayer(id)) map.removeLayer(id);

            if (map.getSource(id)) map.removeSource(id);

        });

        incidentLayerIdsRef.current = [];

    }, []);



    const drawRoutes = useCallback(

        (map, routeList, activeIdx) => {

            clearRouteLayers(map);

            routeList.forEach((route, idx) => {

                if (!route.coords?.length) return;

                const id = `tomtom-route-${idx}`;

                map.addSource(id, {

                    type: 'geojson',

                    data: {

                        type: 'Feature',

                        geometry: { type: 'LineString', coordinates: route.coords }

                    }

                });

                map.addLayer({

                    id,

                    type: 'line',

                    source: id,

                    layout: { 'line-join': 'round', 'line-cap': 'round' },

                    paint: {

                        'line-color': ROUTE_COLORS[idx] || ROUTE_COLORS[0],

                        'line-width': idx === activeIdx ? 7 : 4,

                        'line-opacity': idx === activeIdx ? 0.95 : 0.45

                    }

                });

                routeLayerIdsRef.current.push(id);

            });

        },

        [clearRouteLayers]

    );

    const drawGeofences = useCallback(
        (map, fenceList) => {
            clearGeofenceLayers(map);
            (fenceList || []).forEach((fence, idx) => {
                if (!fence.polygon?.length || fence.polygon.length < 3) return;
                const meta = zoneTypeMeta(fence.zone_type);
                const coords = fence.polygon.map((p) => [p.lon, p.lat]);
                if (coords[0][0] !== coords[coords.length - 1][0] ||
                    coords[0][1] !== coords[coords.length - 1][1]) {
                    coords.push(coords[0]);
                }
                const id = `tomtom-geofence-${fence.id || idx}`;
                map.addSource(id, {
                    type: 'geojson',
                    data: {
                        type: 'Feature',
                        geometry: { type: 'Polygon', coordinates: [coords] }
                    }
                });
                map.addLayer({
                    id: `${id}-fill`,
                    type: 'fill',
                    source: id,
                    paint: {
                        'fill-color': meta.fillColor,
                        'fill-opacity': meta.fillOpacity
                    }
                });
                map.addLayer({
                    id: `${id}-line`,
                    type: 'line',
                    source: id,
                    paint: {
                        'line-color': meta.color,
                        'line-width': 2.5,
                        'line-opacity': 0.9,
                        'line-dasharray': fence.zone_type === 'secret' ? [2, 2] : [1, 0]
                    }
                });
                geofenceLayerIdsRef.current.push(id);
            });
        },
        [clearGeofenceLayers]
    );



    const drawIncidentLines = useCallback(

        (map, incidentList) => {

            clearIncidentLayers(map);

            incidentList.forEach((inc, idx) => {

                if (!inc.lines?.length) return;

                const id = `tomtom-incident-line-${idx}`;

                map.addSource(id, {

                    type: 'geojson',

                    data: {

                        type: 'Feature',

                        geometry: { type: 'LineString', coordinates: inc.lines }

                    }

                });

                map.addLayer({

                    id,

                    type: 'line',

                    source: id,

                    layout: { 'line-join': 'round', 'line-cap': 'round' },

                    paint: {

                        'line-color': inc.color || '#f59e0b',

                        'line-width': 5,

                        'line-opacity': 0.75

                    }

                });

                incidentLayerIdsRef.current.push(id);

            });

        },

        [clearIncidentLayers]

    );



    const updateMarkers = useCallback((map) => {
        if (originLat != null && originLon != null) {
            if (!operatorMarkerRef.current) {
                operatorMarkerRef.current = new tt.Marker({
                    element: createMarkerElement('operator', 'O')
                })
                    .setLngLat([originLon, originLat])
                    .addTo(map);
                markersRef.current.push(operatorMarkerRef.current);
            } else {
                operatorMarkerRef.current.setLngLat([originLon, originLat]);
            }
        } else if (operatorMarkerRef.current) {
            operatorMarkerRef.current.remove();
            markersRef.current = markersRef.current.filter((m) => m !== operatorMarkerRef.current);
            operatorMarkerRef.current = null;
        }

        if (destinationLat != null && destinationLon != null) {
            if (!subjectMarkerRef.current) {
                subjectMarkerRef.current = new tt.Marker({
                    element: createMarkerElement('subject', 'S')
                })
                    .setLngLat([destinationLon, destinationLat])
                    .addTo(map);
                markersRef.current.push(subjectMarkerRef.current);
            } else {
                subjectMarkerRef.current.setLngLat([destinationLon, destinationLat]);
            }
        } else if (subjectMarkerRef.current) {
            subjectMarkerRef.current.remove();
            markersRef.current = markersRef.current.filter((m) => m !== subjectMarkerRef.current);
            subjectMarkerRef.current = null;
        }
    }, [originLat, originLon, destinationLat, destinationLon]);



    const updateIncidentMarkers = useCallback((map, incidentList) => {

        incidentMarkersRef.current.forEach((m) => m.remove());

        incidentMarkersRef.current = [];



        incidentList.forEach((inc) => {

            if (inc.lat == null || inc.lon == null) return;

            const marker = new tt.Marker({ element: createIncidentMarker(inc) })

                .setLngLat([inc.lon, inc.lat])

                .addTo(map);

            incidentMarkersRef.current.push(marker);

        });

    }, []);



    const updateRadarMarkers = useCallback((map, radarList) => {
        radarMarkersRef.current.forEach((m) => m.remove());
        radarMarkersRef.current = [];

        radarList.forEach((radar) => {
            if (radar.lat == null || radar.lon == null) return;
            const marker = new tt.Marker({ element: createRadarMarker(radar) })
                .setLngLat([radar.lon, radar.lat])
                .addTo(map);
            radarMarkersRef.current.push(marker);
        });
    }, []);



    const loadRadars = useCallback(async () => {
        if (!TOMTOM_API_KEY) return;

        const map = mapRef.current;
        let queryCenter = resolveNavCenter({
            centerLat,
            centerLon,
            origin,
            destination,
            map: map && map.getZoom() >= NAV_STYLE_ZOOM_THRESHOLD ? map : null
        });

        const bboxOverride =
            map && map.getZoom() >= NAV_STYLE_ZOOM_THRESHOLD ? bboxFromMap(map) : null;

        const centerKey = bboxOverride
            ? `${bboxOverride.minLon.toFixed(2)},${bboxOverride.minLat.toFixed(2)},${bboxOverride.maxLon.toFixed(2)},${bboxOverride.maxLat.toFixed(2)}`
            : `${queryCenter.lat.toFixed(3)},${queryCenter.lon.toFixed(3)}`;

        const now = Date.now();
        if (
            lastRadarFetchRef.current.centerKey === centerKey &&
            now - lastRadarFetchRef.current.at < 60_000
        ) {
            return;
        }

        setLoadingRadars(true);
        try {
            const list = await fetchAllRadars(TOMTOM_API_KEY, queryCenter, bboxOverride);
            setRadars(list);
            radarsRef.current = list;
            lastRadarFetchRef.current = { at: now, centerKey };
            if (map && mapReady) {
                updateRadarMarkers(map, list);
            }
        } catch {
            setRadars([]);
            radarsRef.current = [];
        } finally {
            setLoadingRadars(false);
        }
    }, [
        centerLat,
        centerLon,
        originLat,
        originLon,
        destinationLat,
        destinationLon,
        mapReady,
        updateRadarMarkers
    ]);

    loadRadarsRef.current = loadRadars;

    useEffect(() => {
        radarsRef.current = radars;
    }, [radars]);



    const loadIncidents = useCallback(async () => {
        if (!TOMTOM_API_KEY) return;

        const map = mapRef.current;
        let queryCenter = resolveNavCenter({
            centerLat,
            centerLon,
            origin,
            destination,
            map: map && map.getZoom() >= NAV_STYLE_ZOOM_THRESHOLD ? map : null
        });

        if (!navigationMode && mapCenter.lat != null) {
            queryCenter = { lat: mapCenter.lat, lon: mapCenter.lon };
        }

        const bboxOverride =
            map && map.getZoom() >= NAV_STYLE_ZOOM_THRESHOLD ? bboxFromMap(map) : null;

        const centerKey = bboxOverride
            ? `${bboxOverride.minLon.toFixed(2)},${bboxOverride.minLat.toFixed(2)},${bboxOverride.maxLon.toFixed(2)},${bboxOverride.maxLat.toFixed(2)}`
            : `${queryCenter.lat.toFixed(3)},${queryCenter.lon.toFixed(3)}`;

        const now = Date.now();

        if (
            lastIncidentFetchRef.current.centerKey === centerKey &&
            now - lastIncidentFetchRef.current.at < 60_000
        ) {
            return;
        }

        setLoadingIncidents(true);

        try {
            const events = await fetchTomTomTrafficEvents(
                TOMTOM_API_KEY,
                origin,
                destination,
                queryCenter,
                bboxOverride
            );

            setIncidents(events);
            incidentsRef.current = events;
            lastIncidentFetchRef.current = { at: now, centerKey };

            if (map && mapReady) {
                updateIncidentMarkers(map, events);
                drawIncidentLines(map, events);
            }
        } catch {
            setIncidents([]);
            incidentsRef.current = [];
        } finally {
            setLoadingIncidents(false);
        }
    }, [
        centerLat,
        centerLon,
        originLat,
        originLon,
        destinationLat,
        destinationLon,
        mapCenter.lat,
        mapCenter.lon,
        navigationMode,
        mapReady,
        updateIncidentMarkers,
        drawIncidentLines,
        origin,
        destination
    ]);

    const redrawIncidents = useCallback(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        updateIncidentMarkers(map, incidentsRef.current);
        drawIncidentLines(map, incidentsRef.current);
    }, [mapReady, updateIncidentMarkers, drawIncidentLines]);

    loadIncidentsRef.current = loadIncidents;
    redrawIncidentsRef.current = redrawIncidents;

    useEffect(() => {
        incidentsRef.current = incidents;
    }, [incidents]);

    const refreshIncidents = useCallback(() => {
        redrawIncidentsRef.current?.();
        lastIncidentFetchRef.current = { at: 0, centerKey: '' };
        lastRadarFetchRef.current = { at: 0, centerKey: '' };
        loadIncidentsRef.current?.();
        loadRadarsRef.current?.();
    }, []);

    const operatorPosition = useMemo(() => {
        if (origin?.lat != null) {
            return {
                lat: origin.lat,
                lon: origin.lon,
                speedKmh: operatorSpeedKmh
            };
        }
        if (userLocation?.lat != null) {
            return {
                lat: userLocation.lat,
                lon: userLocation.lon,
                speedKmh: operatorSpeedKmh ?? userLocation.speedKmh
            };
        }
        return null;
    }, [origin, userLocation, operatorSpeedKmh]);

    const { unlockAudio } = useRadarAlerts(operatorPosition, radars, {
        enabled: navigationMode && radarSoundOn,
        soundEnabled: radarSoundOn
    });

    useEffect(() => {
        if (!mapReady || operatorPosition?.lat == null) return undefined;

        let cancelled = false;

        const tick = async () => {
            if (!operatorPosition?.lat) return;
            const result = await fetchSpeedLimit(operatorPosition.lat, operatorPosition.lon);
            if (!cancelled) {
                setSpeedLimit(result);
                lastSpeedLimitPosRef.current = {
                    lat: operatorPosition.lat,
                    lon: operatorPosition.lon
                };
            }
        };

        const shouldFetchNow =
            !lastSpeedLimitPosRef.current ||
            movedEnough(operatorPosition, lastSpeedLimitPosRef.current, 50);

        if (shouldFetchNow) tick();
        const id = setInterval(tick, 8000);
        return () => {
            cancelled = true;
            clearInterval(id);
        };
    }, [mapReady, operatorPosition?.lat, operatorPosition?.lon]);

    const flownToTrackingRef = useRef(false);
    const viewModeRef = useRef(viewMode);
    const prevViewModeRef = useRef(viewMode);
    viewModeRef.current = viewMode;

    const navContextRef = useRef({});
    navContextRef.current = { centerLat, centerLon, origin, destination };

    useEffect(() => {
        if (viewModeProp) setViewMode(viewModeProp);
    }, [viewModeProp]);

    const mapPitch = navPitchForView(viewMode);

    const handleViewModeSelect = useCallback(
        (mode) => {
            const map = mapRef.current;
            prevViewModeRef.current = mode;
            setViewMode(mode);
            if (!map || !mapReady) return;
            if (map.getZoom() < NAV_STYLE_ZOOM_THRESHOLD) {
                markProgrammaticMove(1000);
                const center = resolveNavCenter({ ...navContextRef.current, map });
                ensureNavWazeView(map, mode, center, refreshIncidents);
                return;
            }
            applyViewPitch(map, mode);
            refreshNavLayers(map, refreshIncidents);
        },
        [mapReady, refreshIncidents, markProgrammaticMove]
    );

    useEffect(() => {
        if (!mapContainerRef.current || !TOMTOM_API_KEY) return undefined;

        const navStartCenter = resolveNavCenter({
            centerLat,
            centerLon,
            origin,
            destination,
            map: null
        });

        const map = tt.map({
            key: TOMTOM_API_KEY,
            container: mapContainerRef.current,
            center: [navStartCenter.lon, navStartCenter.lat],
            zoom: NAV_TRACKING_ZOOM,
            pitch: navigationMode ? mapPitch : 0,
            maxPitch: navigationMode && viewMode === '2d' ? 0 : 60,
            language: TOMTOM_MAP_LANGUAGE,
            style: NAV_MAP_STYLE,
            localIdeographFontFamily: NAV_LABEL_FONT,
            trackResize: true
        });

        mapRef.current = map;
        flownToTrackingRef.current = false;

        whenTomTomStyleReady(map, () => {
            setMapReady(true);
        });

        const resizeObserver =
            typeof ResizeObserver !== 'undefined'
                ? new ResizeObserver(() => {
                      map.resize();
                  })
                : null;
        resizeObserver?.observe(mapContainerRef.current);

        let moveDebounce;
        let labelReinforceTimer;

        const onViewportChange = () => {
            if (suppressViewportReloadRef.current) return;
            clearTimeout(moveDebounce);
            moveDebounce = setTimeout(() => {
                const m = mapRef.current;
                if (!m || m.getZoom() < NAV_STYLE_ZOOM_THRESHOLD) return;
                lastIncidentFetchRef.current = { at: 0, centerKey: '' };
                lastRadarFetchRef.current = { at: 0, centerKey: '' };
                loadIncidentsRef.current?.();
                loadRadarsRef.current?.();
            }, 800);
        };

        map.on('moveend', onViewportChange);

        map.once('idle', () => {
            clearTimeout(labelReinforceTimer);
            labelReinforceTimer = window.setTimeout(() => {
                const m = mapRef.current;
                if (!m) return;
                reinforceTomTomLabels(m);
                ensureMapLabelsVisible(m);
            }, 1200);
        });

        map.on('error', (event) => {
            console.warn('TomTom xəritə xətası:', event?.error || event);
        });

        return () => {
            clearTimeout(suppressViewportTimerRef.current);
            clearTimeout(moveDebounce);
            clearTimeout(labelReinforceTimer);
            resizeObserver?.disconnect();

            setMapReady(false);

            operatorMarkerRef.current?.remove();
            subjectMarkerRef.current?.remove();
            operatorMarkerRef.current = null;
            subjectMarkerRef.current = null;

            markersRef.current.forEach((m) => m.remove());

            incidentMarkersRef.current.forEach((m) => m.remove());

            radarMarkersRef.current.forEach((m) => m.remove());

            markersRef.current = [];

            incidentMarkersRef.current = [];

            radarMarkersRef.current = [];

            map.remove();

            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- xəritə yalnız mount/navigationMode dəyişəndə yaradılır; GPS gələndə flyTo işləyir
    }, [navigationMode]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady || !navigationMode) return;

        const viewChanged = prevViewModeRef.current !== viewMode;
        prevViewModeRef.current = viewMode;

        const center = resolveNavCenter({ ...navContextRef.current, map });

        if (viewChanged) {
            if (map.getZoom() < NAV_STYLE_ZOOM_THRESHOLD) {
                markProgrammaticMove(1000);
                ensureNavWazeView(map, viewMode, center, refreshIncidents);
            } else {
                applyViewPitch(map, viewMode);
                refreshNavLayers(map, refreshIncidents);
            }
            return;
        }
    }, [viewMode, mapReady, navigationMode, refreshIncidents, markProgrammaticMove]);

    useEffect(() => {
        if (!mapReady) return;
        loadIncidentsRef.current?.();
        loadRadarsRef.current?.();
        const id = window.setTimeout(() => {
            const map = mapRef.current;
            if (!map) return;
            reinforceTomTomLabels(map);
            ensureMapLabelsVisible(map);
        }, 2500);
        return () => clearTimeout(id);
    }, [mapReady]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady || !navigationMode || !trackingActive) return;
        if (flownToTrackingRef.current) return;

        const target = destination || origin || { lat: centerLat, lon: centerLon };
        if (target?.lat == null || target?.lon == null) return;

        flownToTrackingRef.current = true;
        markProgrammaticMove(1000);
        ensureNavWazeView(map, viewModeRef.current, target, refreshIncidents);
    }, [
        mapReady,
        navigationMode,
        trackingActive,
        destinationLat,
        destinationLon,
        originLat,
        originLon,
        centerLat,
        centerLon,
        refreshIncidents,
        markProgrammaticMove
    ]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady || !navigationMode || !trackingActive) return;

        const target =
            originLat != null && originLon != null
                ? { lat: originLat, lon: originLon }
                : centerLat != null && centerLon != null
                  ? { lat: centerLat, lon: centerLon }
                  : null;
        if (!target) return;

        if (!movedEnough(target, lastMapFollowRef.current, 45)) return;
        lastMapFollowRef.current = { lat: target.lat, lon: target.lon };

        markProgrammaticMove(900);
        const zoom = Math.max(map.getZoom(), NAV_TRACKING_ZOOM);
        map.easeTo({
            center: [target.lon, target.lat],
            zoom,
            pitch: navPitchForView(viewModeRef.current),
            duration: 900
        });
        map.once('moveend', () => {
            reinforceTomTomLabels(map);
            ensureMapLabelsVisible(map);
        });
    }, [
        mapReady,
        navigationMode,
        trackingActive,
        originLat,
        originLon,
        centerLat,
        centerLon,
        markProgrammaticMove
    ]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        updateMarkers(map);
    }, [mapReady, updateMarkers]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady || !routes.length) return;

        drawRoutes(map, routes, selectedRouteIdx);



        const coords = routes[selectedRouteIdx]?.coords || [];

        if (!navigationMode && coords.length >= 2) {

            const bounds = coords.reduce(

                (b, c) => b.extend(c),

                new tt.LngLatBounds(coords[0], coords[0])

            );

            map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 600 });

        }

    }, [mapReady, routes, selectedRouteIdx, drawRoutes, navigationMode]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        drawGeofences(map, geofences);
    }, [mapReady, geofences, drawGeofences]);



    useEffect(() => {

        const map = mapRef.current;

        if (!map || !mapReady) return;

        updateIncidentMarkers(map, incidents);

        drawIncidentLines(map, incidents);

    }, [mapReady, incidents, updateIncidentMarkers, drawIncidentLines]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        updateRadarMarkers(map, radars);
    }, [mapReady, radars, updateRadarMarkers]);

    useEffect(() => {
        if (!origin || !destination) return undefined;
        const id = setInterval(() => {
            loadIncidents();
        }, 180_000);
        return () => clearInterval(id);
    }, [origin, destination, loadIncidents]);

    useEffect(() => {
        if (!mapReady) return undefined;
        const id = setInterval(() => {
            loadIncidentsRef.current?.();
            loadRadarsRef.current?.();
        }, 120_000);
        return () => clearInterval(id);
    }, [mapReady]);



    if (!TOMTOM_API_KEY) {

        return (

            <div className="tomtom-waze tomtom-waze--error">

                TomTom API key tapılmadı. frontend/.env faylına REACT_APP_TOMTOM_API_KEY əlavə edin.

            </div>

        );

    }



    const navUrl = destination ? wazeUrl(destination.lat, destination.lon, true) : null;

    const filteredIncidents = incidents.filter(
        (inc) => inc.type !== INCIDENT_TYPE.JAM && inc.type !== INCIDENT_TYPE.RADAR
    );

    const currentSpeedKmh =
        operatorSpeedKmh ??
        userLocation?.speedKmh ??
        (origin && devices.find((d) => d.lat === origin.lat)?.speed != null
            ? devices.find((d) => d.lat === origin.lat).speed * 3.6
            : null);



    return (

        <div className="tomtom-waze" onClick={unlockAudio} onTouchStart={unlockAudio}>

            {(navigationMode || radars.length > 0) && (
                <SpeedLimitHud
                    limitKmh={speedLimit.limitKmh}
                    speedKmh={currentSpeedKmh}
                    source={speedLimit.source}
                />
            )}

            <div className="tomtom-waze__hud">
                <RouteEtaPanel
                    routes={routes}
                    selectedRouteIdx={selectedRouteIdx}
                    onSelectRoute={setSelectedRouteIdx}
                    loadingRoutes={loadingRoutes}
                    routeError={routeError}
                    origin={origin}
                    destination={destination}
                />

                <div className="tomtom-waze__incidents">

                    <button

                        type="button"

                        className="tomtom-waze__incidents-toggle"

                        onClick={() => setIncidentsOpen((v) => !v)}

                    >

                        <strong>Trafik hadisələri</strong>

                        <span>

                            {loadingIncidents

                                ? 'yenilənir...'

                                : `${filteredIncidents.length} hadisə`}

                        </span>

                    </button>



                    {incidentsOpen && (

                        <>

                            {incidentSummary.length > 0 && (

                                <div className="tomtom-waze__incident-chips">

                                    {incidentSummary

                                        .filter((s) => s.type !== INCIDENT_TYPE.JAM)

                                        .map((s) => (

                                            <span

                                                key={s.type}

                                                className="tomtom-waze__incident-chip"

                                                style={{ borderColor: s.color }}

                                            >

                                                {s.emoji} {s.label} ({s.count})

                                            </span>

                                        ))}

                                </div>

                            )}



                            {filteredIncidents.length > 0 ? (

                                <ul className="tomtom-waze__incident-list">

                                    {filteredIncidents.slice(0, 12).map((inc) => (

                                        <li key={inc.id}>

                                            <span className="tomtom-waze__incident-emoji">

                                                {inc.emoji}

                                            </span>

                                            <span>

                                                <strong>{inc.label}</strong>

                                                <small>{inc.description}</small>

                                                {inc.from && (

                                                    <small>

                                                        {inc.from}

                                                        {inc.to ? ` → ${inc.to}` : ''}

                                                    </small>

                                                )}

                                            </span>

                                        </li>

                                    ))}

                                </ul>

                            ) : (

                                <p className="tomtom-waze__hint">

                                    {loadingIncidents

                                        ? 'Hadisələr yüklənir...'

                                        : 'Bu ərazidə aktiv hadisə tapılmadı'}

                                </p>

                            )}

                        </>

                    )}

                </div>



                {navUrl && (

                    <a href={navUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#22d3ee' }}>

                        Waze-də aç →

                    </a>

                )}

            </div>

            <div className="tomtom-waze__legend">

                {navigationMode && (
                    <button
                        type="button"
                        className={`tomtom-waze__radar-toggle${radarSoundOn ? ' is-on' : ''}`}
                        onClick={() => {
                            const next = !radarSoundOn;
                            setRadarSoundOn(next);
                            setRadarSoundEnabled(next);
                            unlockAudio();
                        }}
                    >
                        {radarSoundOn ? '🔊 Radar səsi' : '🔇 Radar səsi'}
                    </button>
                )}

                {navigationMode && (
                    <div className="tomtom-waze__view-toggle" role="group" aria-label="2D / 3D görünüş">
                        <button
                            type="button"
                            className={viewMode === '2d' ? 'is-active' : ''}
                            onClick={() => handleViewModeSelect('2d')}
                        >
                            2D
                        </button>
                        <button
                            type="button"
                            className={viewMode === '3d' ? 'is-active' : ''}
                            onClick={() => handleViewModeSelect('3d')}
                        >
                            3D
                        </button>
                    </div>
                )}

                <span>

                    <i style={{ color: '#22c55e' }}>●</i> Operator

                </span>

                <span>

                    <i style={{ color: '#ef4444' }}>●</i> Subyekt

                </span>

                <span>🚧 Yol işləri</span>

                <span>💥 Qəzalar</span>

                <span>🚓 Polis əməliyyatları</span>

                <span>⚠️ Təhlükəli ərazilər</span>

                <span>🚫 Bağlı yollar</span>

                <span>📷 Sürət kamerası{loadingRadars ? '…' : radars.length ? ` (${radars.length})` : ''}</span>

            </div>



            <div ref={mapContainerRef} className="tomtom-waze__map" />

        </div>

    );

}


