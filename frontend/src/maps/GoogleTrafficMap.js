import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    GoogleMap,
    TrafficLayer,
    DirectionsRenderer,
    Marker,
    useJsApiLoader
} from '@react-google-maps/api';
import { GOOGLE_MAPS_API_KEY } from '../config';
import { googleMapsUrl, wazeUrl } from '../geolocation';
import './GoogleTrafficMap.css';

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };

const MAP_OPTIONS = {
    disableDefaultUI: false,
    zoomControl: true,
    mapTypeControl: true,
    streetViewControl: true,
    fullscreenControl: true,
    mapTypeId: 'roadmap'
};

function formatDuration(seconds) {
    if (seconds == null || Number.isNaN(seconds)) return '—';
    const m = Math.round(seconds / 60);
    if (m < 60) return `${m} dəq`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `${h} sa ${rm} dəq` : `${h} sa`;
}

function formatDistance(meters) {
    if (meters == null) return '';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

function googleDirectionsUrl(origin, destination) {
    if (!origin || !destination) return null;
    const o = `${origin.lat},${origin.lon}`;
    const d = `${destination.lat},${destination.lon}`;
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o)}&destination=${encodeURIComponent(d)}&travelmode=driving`;
}

function movedEnough(a, b, thresholdM = 80) {
    if (!a || !b) return true;
    const dlat = (a.lat - b.lat) * 111320;
    const dlon = (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
    return Math.hypot(dlat, dlon) > thresholdM;
}

export default function GoogleTrafficMap({
    devices = [],
    selectedDevice,
    userLocation,
    centerLat,
    centerLon
}) {
    const { isLoaded, loadError } = useJsApiLoader({
        id: 'tracking-google-maps',
        googleMapsApiKey: GOOGLE_MAPS_API_KEY
    });

    const [directions, setDirections] = useState(null);
    const [routeMeta, setRouteMeta] = useState(null);
    const [routeError, setRouteError] = useState('');
    const lastFetchRef = useRef({ key: '', at: 0 });

    const center = useMemo(
        () => ({ lat: centerLat, lng: centerLon }),
        [centerLat, centerLon]
    );

    const destination = useMemo(() => {
        const d = selectedDevice?.lat != null ? selectedDevice : devices.find((x) => x.lat != null);
        if (!d) return null;
        return { lat: d.lat, lon: d.lon, label: d.device_name || d.device_id };
    }, [selectedDevice, devices]);

    const origin = useMemo(() => {
        if (userLocation?.lat != null && userLocation?.lon != null) {
            return { lat: userLocation.lat, lon: userLocation.lon, label: 'Operator' };
        }
        const others = devices.filter(
            (d) =>
                d.lat != null &&
                d.lon != null &&
                d.device_id !== selectedDevice?.device_id
        );
        if (others.length === 0) return null;
        return {
            lat: others[0].lat,
            lon: others[0].lon,
            label: others[0].device_name || others[0].device_id
        };
    }, [userLocation, devices, selectedDevice?.device_id]);

    const fetchDirections = useCallback(() => {
        if (!isLoaded || !window.google?.maps || !origin || !destination) {
            setDirections(null);
            setRouteMeta(null);
            return;
        }

        const key = `${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}->${destination.lat.toFixed(4)},${destination.lon.toFixed(4)}`;
        const now = Date.now();
        if (
            lastFetchRef.current.key === key &&
            now - lastFetchRef.current.at < 120_000
        ) {
            return;
        }

        const service = new window.google.maps.DirectionsService();
        service.route(
            {
                origin: { lat: origin.lat, lng: origin.lon },
                destination: { lat: destination.lat, lng: destination.lon },
                travelMode: window.google.maps.TravelMode.DRIVING,
                drivingOptions: {
                    departureTime: new Date(),
                    trafficModel: window.google.maps.TrafficModel.BEST_GUESS
                },
                provideRouteAlternatives: true
            },
            (result, status) => {
                if (status !== 'OK' || !result?.routes?.length) {
                    setDirections(null);
                    setRouteMeta(null);
                    setRouteError(
                        status === 'ZERO_RESULTS'
                            ? 'Marşrut tapılmadı'
                            : 'Marşrut alınmadı'
                    );
                    return;
                }
                setRouteError('');
                setDirections(result);
                lastFetchRef.current = { key, at: now };

                const routes = result.routes.map((route, idx) => {
                    const leg = route.legs?.[0];
                    const dur =
                        leg?.duration_in_traffic?.value ?? leg?.duration?.value ?? null;
                    return {
                        index: idx,
                        summary: route.summary || `Marşrut ${idx + 1}`,
                        durationSec: dur,
                        distanceM: leg?.distance?.value ?? null,
                        durationText: leg?.duration_in_traffic?.text || leg?.duration?.text
                    };
                });
                routes.sort((a, b) => (a.durationSec || 0) - (b.durationSec || 0));

                setRouteMeta({
                    primary: routes[0],
                    alternatives: routes.slice(1, 3),
                    origin,
                    destination
                });
            }
        );
    }, [isLoaded, origin, destination]);

    useEffect(() => {
        fetchDirections();
    }, [fetchDirections]);

    useEffect(() => {
        if (!origin || !destination) return undefined;
        const id = setInterval(() => {
            if (
                movedEnough(origin, lastFetchRef.current.origin) ||
                movedEnough(destination, lastFetchRef.current.destination)
            ) {
                lastFetchRef.current.origin = origin;
                lastFetchRef.current.destination = destination;
                fetchDirections();
            }
        }, 180_000);
        return () => clearInterval(id);
    }, [origin, destination, fetchDirections]);

    if (loadError) {
        return (
            <div className="google-traffic-map google-traffic-map--error">
                Google Maps yüklənmədi. API key və domain restriction yoxlayın.
            </div>
        );
    }

    if (!isLoaded) {
        return (
            <div className="google-traffic-map google-traffic-map--loading">
                Google Maps (trafik) yüklənir...
            </div>
        );
    }

    const navUrl = googleDirectionsUrl(origin, destination);

    return (
        <div className="google-traffic-map">
            <div className="google-traffic-map__hud">
                {routeMeta?.primary ? (
                    <>
                        <strong>
                            ETA: {formatDuration(routeMeta.primary.durationSec)}
                            {routeMeta.primary.distanceM != null &&
                                ` • ${formatDistance(routeMeta.primary.distanceM)}`}
                        </strong>
                        <span className="google-traffic-map__hint">
                            Trafik nəzərə alınır
                            {routeMeta.alternatives?.length > 0 &&
                                ` • +${routeMeta.alternatives.length} alternativ`}
                        </span>
                    </>
                ) : (
                    <span className="google-traffic-map__hint">
                        {origin && destination
                            ? 'Marşrut hesablanır...'
                            : 'Marşrut üçün operator GPS və ya 2+ cihaz lazımdır'}
                    </span>
                )}
                {routeError && (
                    <span className="google-traffic-map__error">{routeError}</span>
                )}
                {destination && (
                    <div className="google-traffic-map__links">
                        {navUrl && (
                            <a href={navUrl} target="_blank" rel="noopener noreferrer">
                                Google Navi
                            </a>
                        )}
                        <a
                            href={wazeUrl(destination.lat, destination.lon, true)}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Waze
                        </a>
                        <a
                            href={googleMapsUrl(destination.lat, destination.lon)}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            Xəritədə aç
                        </a>
                    </div>
                )}
            </div>

            <GoogleMap
                mapContainerStyle={MAP_CONTAINER_STYLE}
                center={center}
                zoom={14}
                options={MAP_OPTIONS}
            >
                <TrafficLayer />
                {directions && (
                    <DirectionsRenderer
                        directions={directions}
                        options={{
                            suppressMarkers: true,
                            polylineOptions: {
                                strokeColor: '#2563eb',
                                strokeWeight: 5,
                                strokeOpacity: 0.85
                            }
                        }}
                    />
                )}
                {devices.map((d) => {
                    if (d.lat == null || d.lon == null) return null;
                    const isDest =
                        destination &&
                        d.lat === destination.lat &&
                        d.lon === destination.lon;
                    return (
                        <Marker
                            key={d.device_id}
                            position={{ lat: d.lat, lng: d.lon }}
                            title={d.device_name || d.device_id}
                            label={isDest ? 'H' : undefined}
                        />
                    );
                })}
            </GoogleMap>
        </div>
    );
}
