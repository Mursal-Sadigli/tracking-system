import React, { useCallback, useEffect, useMemo, useState } from 'react';
import TomTomWaze from '../components/TomTomWaze';
import { getTrackingSocket } from '../socketService';
import { apiGet } from '../api';
import { GPS_OPTIONS, saveLastKnownLocation } from '../geolocation';
import { ADMIN_PATH } from '../config';
import alertManager, { ALERT_TYPES } from '../AlertManager';
import { geofenceAlertSeverity, geofenceEventMessage } from '../utils/geofenceConstants';
import '../components/TomTomWaze.css';

function TrackingPage() {
    const [devices, setDevices] = useState([]);
    const [selectedCase, setSelectedCase] = useState(null);
    const [userLocation, setUserLocation] = useState(null);
    const [gpsError, setGpsError] = useState('');
    const [geofences, setGeofences] = useState([]);
    const [geofenceAlert, setGeofenceAlert] = useState('');

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

        const onCaseEvent = (ev) => {
            if (ev.type !== 'geofence_enter' && ev.type !== 'geofence_exit') return;
            const zoneType = ev.payload?.zone_type || 'restricted';
            const severity = geofenceAlertSeverity(zoneType, ev.type);
            const message = geofenceEventMessage(ev);
            setGeofenceAlert(message);
            alertManager.addAlert(ALERT_TYPES.GEOFENCE_ALERT, message, severity);
        };
        socket.on('case_event', onCaseEvent);

        return () => {
            socket.off('location_update', onLocation);
            socket.off('case_event', onCaseEvent);
        };
    }, []);

    useEffect(() => {
        if (!navigator.geolocation) {
            setGpsError('Brauzer GPS dəstəkləmir');
            return undefined;
        }

        const watchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy, speed } = pos.coords;
                const speedKmh =
                    speed != null && Number.isFinite(speed) && speed >= 0
                        ? Math.round(speed * 3.6)
                        : null;
                setUserLocation((prev) => {
                    const latR = Math.round(latitude * 1e5) / 1e5;
                    const lonR = Math.round(longitude * 1e5) / 1e5;
                    const prevLatR = prev ? Math.round(prev.lat * 1e5) / 1e5 : null;
                    const prevLonR = prev ? Math.round(prev.lon * 1e5) / 1e5 : null;
                    if (
                        prev &&
                        prevLatR === latR &&
                        prevLonR === lonR &&
                        prev.speedKmh === speedKmh &&
                        prev.accuracy === accuracy
                    ) {
                        return prev;
                    }
                    return { lat: latitude, lon: longitude, accuracy, speedKmh };
                });
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

    useEffect(() => {
        const caseId = selectedCase?.case_id || selectedDevice?.case_id;
        if (!caseId) {
            setGeofences([]);
            return;
        }
        apiGet(`/api/geofences?case_id=${encodeURIComponent(caseId)}`, { admin: true })
            .then((data) => setGeofences(data.geofences || []))
            .catch(() => setGeofences([]));
    }, [selectedCase?.case_id, selectedDevice?.case_id]);

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
                {geofenceAlert && (
                    <span className="tracking-page__warn tracking-page__geofence">{geofenceAlert}</span>
                )}
            </header>
            <div className="tracking-page__map">
                <TomTomWaze
                    devices={caseDevices.length ? caseDevices : devices}
                    selectedDevice={selectedDevice}
                    userLocation={userLocation}
                    centerLat={centerLat}
                    centerLon={centerLon}
                    operatorSpeedKmh={userLocation?.speedKmh}
                    navigationMode
                    geofences={geofences}
                />
            </div>
        </div>
    );
}

export default TrackingPage;
