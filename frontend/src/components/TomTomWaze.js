import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import tt from '@tomtom-international/web-sdk-maps';
import '@tomtom-international/web-sdk-maps/dist/maps.css';
import { TOMTOM_API_KEY } from '../config';
import { formatDuration, formatDistance, movedEnough } from '../utils/mapFormat';
import { fetchTomTomRoutes, fetchTomTomIncidents } from '../utils/tomtomApi';
import { wazeUrl } from '../geolocation';
import './TomTomWaze.css';

const ROUTE_COLORS = ['#22d3ee', '#a78bfa', '#fbbf24'];

function createMarkerElement(kind, label) {
    const el = document.createElement('div');
    el.className = `tomtom-waze-marker tomtom-waze-marker--${kind}`;
    el.textContent = label;
    el.title = kind === 'operator' ? 'Operator' : 'Subyekt';
    return el;
}

function resolveEndpoints(devices, selectedDevice, userLocation) {
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

export default function TomTomWaze({
    devices = [],
    selectedDevice,
    userLocation,
    centerLat,
    centerLon
}) {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef([]);
    const routeLayerIdsRef = useRef([]);
    const lastFetchRef = useRef({ key: '', at: 0, origin: null, destination: null });

    const [mapReady, setMapReady] = useState(false);
    const [routes, setRoutes] = useState([]);
    const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
    const [incidents, setIncidents] = useState([]);
    const [routeError, setRouteError] = useState('');
    const [loadingRoutes, setLoadingRoutes] = useState(false);

    const { origin, destination } = useMemo(
        () => resolveEndpoints(devices, selectedDevice, userLocation),
        [devices, selectedDevice, userLocation]
    );

    const center = useMemo(() => {
        if (centerLon != null && centerLat != null) return [centerLon, centerLat];
        if (destination) return [destination.lon, destination.lat];
        return [49.8671, 40.4093];
    }, [centerLat, centerLon, destination]);

    const clearRouteLayers = useCallback((map) => {
        routeLayerIdsRef.current.forEach((id) => {
            if (map.getLayer(id)) map.removeLayer(id);
            if (map.getSource(id)) map.removeSource(id);
        });
        routeLayerIdsRef.current = [];
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

    const updateMarkers = useCallback((map) => {
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        if (origin) {
            const m = new tt.Marker({ element: createMarkerElement('operator', 'O') })
                .setLngLat([origin.lon, origin.lat])
                .addTo(map);
            markersRef.current.push(m);
        }
        if (destination) {
            const m = new tt.Marker({ element: createMarkerElement('zombie', 'Z') })
                .setLngLat([destination.lon, destination.lat])
                .addTo(map);
            markersRef.current.push(m);
        }
    }, [origin, destination]);

    const loadRoutes = useCallback(async () => {
        if (!TOMTOM_API_KEY || !origin || !destination) {
            setRoutes([]);
            setIncidents([]);
            return;
        }

        const key = `${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}->${destination.lat.toFixed(4)},${destination.lon.toFixed(4)}`;
        const now = Date.now();
        if (lastFetchRef.current.key === key && now - lastFetchRef.current.at < 120_000) {
            return;
        }

        setLoadingRoutes(true);
        setRouteError('');
        try {
            const [parsed, inc] = await Promise.all([
                fetchTomTomRoutes(TOMTOM_API_KEY, origin, destination, 2),
                fetchTomTomIncidents(TOMTOM_API_KEY, origin, destination)
            ]);
            if (!parsed.length) {
                setRouteError('Marşrut tapılmadı');
                setRoutes([]);
            } else {
                setRoutes(parsed);
                setSelectedRouteIdx(0);
                lastFetchRef.current = { key, at: now, origin, destination };
            }
            setIncidents(inc);
        } catch (err) {
            setRouteError(err?.message || 'Marşrut alınmadı');
            setRoutes([]);
        } finally {
            setLoadingRoutes(false);
        }
    }, [origin, destination]);

    const initialCenterRef = useRef(center);

    useEffect(() => {
        if (!mapContainerRef.current || !TOMTOM_API_KEY) return undefined;

        const map = tt.map({
            key: TOMTOM_API_KEY,
            container: mapContainerRef.current,
            center: initialCenterRef.current,
            zoom: 13,
            style: {
                map: 'basic_night',
                trafficIncidents: 'incidents_night',
                trafficFlow: 'flow_relative'
            },
            stylesVisibility: {
                trafficFlow: true,
                trafficIncidents: true
            }
        });

        mapRef.current = map;

        map.on('load', () => {
            map.showTrafficFlow();
            map.showTrafficIncidents();
            setMapReady(true);
        });

        return () => {
            setMapReady(false);
            markersRef.current.forEach((m) => m.remove());
            markersRef.current = [];
            map.remove();
            mapRef.current = null;
        };
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        updateMarkers(map);
    }, [mapReady, updateMarkers]);

    useEffect(() => {
        loadRoutes();
    }, [loadRoutes]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady || !routes.length) return;
        drawRoutes(map, routes, selectedRouteIdx);

        const coords = routes[selectedRouteIdx]?.coords || [];
        if (coords.length >= 2) {
            const bounds = coords.reduce(
                (b, c) => b.extend(c),
                new tt.LngLatBounds(coords[0], coords[0])
            );
            map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 600 });
        }
    }, [mapReady, routes, selectedRouteIdx, drawRoutes]);

    useEffect(() => {
        if (!origin || !destination) return undefined;
        const id = setInterval(() => {
            if (
                movedEnough(origin, lastFetchRef.current.origin) ||
                movedEnough(destination, lastFetchRef.current.destination)
            ) {
                loadRoutes();
            }
        }, 180_000);
        return () => clearInterval(id);
    }, [origin, destination, loadRoutes]);

    if (!TOMTOM_API_KEY) {
        return (
            <div className="tomtom-waze tomtom-waze--error">
                TomTom API key tapılmadı. frontend/.env faylına REACT_APP_TOMTOM_API_KEY əlavə edin.
            </div>
        );
    }

    const activeRoute = routes[selectedRouteIdx];
    const navUrl = destination ? wazeUrl(destination.lat, destination.lon, true) : null;

    return (
        <div className="tomtom-waze">
            <div className="tomtom-waze__hud">
                {activeRoute ? (
                    <>
                        <div className="tomtom-waze__eta">
                            ETA: {formatDuration(activeRoute.travelTimeInSeconds)}
                            {activeRoute.lengthInMeters != null &&
                                ` • ${formatDistance(activeRoute.lengthInMeters)}`}
                        </div>
                        {activeRoute.trafficDelayInSeconds > 0 && (
                            <span className="tomtom-waze__hint">
                                Trafik gecikməsi: +{formatDuration(activeRoute.trafficDelayInSeconds)}
                            </span>
                        )}
                    </>
                ) : (
                    <span className="tomtom-waze__hint">
                        {loadingRoutes
                            ? 'Marşrut hesablanır...'
                            : origin && destination
                              ? 'Marşrut gözlənilir...'
                              : 'Marşrut üçün operator GPS və subyekt konumu lazımdır'}
                    </span>
                )}
                {routeError && <span className="tomtom-waze__error">{routeError}</span>}

                {routes.length > 1 && (
                    <div className="tomtom-waze__routes">
                        {routes.map((r, idx) => (
                            <button
                                key={r.index}
                                type="button"
                                className={`tomtom-waze__route-btn${idx === selectedRouteIdx ? ' is-active' : ''}`}
                                onClick={() => setSelectedRouteIdx(idx)}
                            >
                                Marşrut {idx + 1}: {formatDuration(r.travelTimeInSeconds)}
                                {r.lengthInMeters != null && ` • ${formatDistance(r.lengthInMeters)}`}
                            </button>
                        ))}
                    </div>
                )}

                {incidents.length > 0 && (
                    <div className="tomtom-waze__incidents">
                        <strong>Trafik hadisələri</strong>
                        <ul>
                            {incidents.map((inc) => (
                                <li key={inc.id}>{inc.label}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {navUrl && (
                    <a href={navUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#22d3ee' }}>
                        Waze-də aç →
                    </a>
                )}
            </div>

            <div className="tomtom-waze__legend">
                <span>
                    <i style={{ color: '#22c55e' }}>●</i> Operator
                </span>
                <span>
                    <i style={{ color: '#ef4444' }}>●</i> Subyekt
                </span>
                <span>
                    <i style={{ color: '#ef4444' }}>▬</i> Tıxac
                </span>
                <span>
                    <i style={{ color: '#fbbf24' }}>▬</i> Orta
                </span>
                <span>
                    <i style={{ color: '#22c55e' }}>▬</i> Az
                </span>
            </div>

            <div ref={mapContainerRef} className="tomtom-waze__map" />
        </div>
    );
}
