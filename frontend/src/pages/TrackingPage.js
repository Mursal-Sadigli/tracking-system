import React, { useCallback, useEffect, useMemo, useState } from 'react';
import TomTomWaze from '../components/TomTomWaze';
import { getTrackingSocket } from '../socketService';
import { apiGet } from '../api';
import { GPS_OPTIONS, saveLastKnownLocation } from '../geolocation';
import { ADMIN_PATH } from '../config';
import '../components/TomTomWaze.css';

function TrackingPage() {
    const [devices, setDevices] = useState([]);
    const [selectedCase, setSelectedCase] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [gpsError, setGpsError] = useState('');

    const loadCases = useCallback(async () => {
        try {
            const data = await apiGet('/api/cases?status=active', { admin: true });
            const cases = data.cases || [];
            if (!selectedCase && cases.length) {
                setSelectedCase(cases[0]);
            }
        } catch (e) {
            console.error(e);
        }
    }, [selectedCase]);

    useEffect(() => {
        loadCases();
    }, [loadCases]);

    useEffect(() => {
        const socket = getTrackingSocket();
        socket.emit('case_subscribe', { all_active: true });

        const onLocation = (data) => {
            setDevices((prev) => {
                const patch = {
                    device_id: data.device_id,
                    lat: data.latitude,
                    lon: data.longitude,
                    speed: data.speed,
                    device_name: data.device_name,
                    case_id: data.case_id,
                    accuracy: data.accuracy
                };
                const idx = prev.findIndex((d) => d.device_id === data.device_id);
                if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = { ...next[idx], ...patch };
                    return next;
                }
                return [...prev, patch];
            });
        };

        socket.on('location_update', onLocation);
        return () => socket.off('location_update', onLocation);
    }, []);

    useEffect(() => {
        if (!navigator.geolocation) {
            setGpsError('Brauzer GPS dəstəkləmir');
            return undefined;
        }

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;
                setUserLocation({ lat: latitude, lon: longitude, accuracy });
                if (accuracy != null && accuracy <= 500) {
                    saveLastKnownLocation(latitude, longitude, accuracy);
                }
                setGpsError('');
            },
            () => setGpsError('Operator GPS icazəsi verilməyib'),
            GPS_OPTIONS
        );

        return () => navigator.geolocation.clearWatch(watchId);
    }, []);

    const caseDevices = useMemo(() => {
        if (!selectedCase) return devices;
        return devices.filter((d) => d.case_id === selectedCase.case_id);
    }, [devices, selectedCase]);

    const selectedDevice = caseDevices[0] || null;

    const centerLat = selectedDevice?.lat ?? userLocation?.lat;
    const centerLon = selectedDevice?.lon ?? userLocation?.lon;

    const adminRoute = ADMIN_PATH.startsWith('/') ? ADMIN_PATH : `/${ADMIN_PATH}`;

    return (
        <div className="tracking-page">
            <header className="tracking-page__bar">
                <a href={adminRoute} className="tracking-page__back">
                    ← Admin
                </a>
                <h1>Waze naviqasiya</h1>
                {gpsError && <span className="tracking-page__warn">{gpsError}</span>}
            </header>
            <div className="tracking-page__map">
                {centerLat != null && centerLon != null ? (
                    <TomTomWaze
                        devices={caseDevices.length ? caseDevices : devices}
                        selectedDevice={selectedDevice}
                        userLocation={userLocation}
                        centerLat={centerLat}
                        centerLon={centerLon}
                    />
                ) : (
                    <div className="tomtom-waze tomtom-waze--loading">
                        Subyekt konumu gözlənilir...
                    </div>
                )}
            </div>
        </div>
    );
}

export default TrackingPage;
