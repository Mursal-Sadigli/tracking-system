import React, { useState, useEffect, useRef, useCallback } from 'react';
import MapComponent from './MapComponent';
import DeviceList from './DeviceList';
import StatsPanel from './StatsPanel';
import AlertPanel from './AlertPanel';
import PathPlayback from './PathPlayback';
import ExportPanel from './ExportPanel';
import CitySelector from './CitySelector';
import alertManager, { ALERT_TYPES, ALERT_SEVERITY, SPEED_THRESHOLD, OFFLINE_TIMEOUT } from './AlertManager';
import { useLocationTracker } from './hooks/useLocationTracker';
import { apiGet } from './api';
import {
    clearLastKnownLocation,
    describeLocationQuality,
    isLikelyAzNetworkFallback,
    isSecureLocationContext
} from './geolocation';
import './Dashboard.css';

function getDeviceInfo() {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
    else if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
    else if (ua.indexOf('Safari') > -1) browser = 'Safari';
    else if (ua.indexOf('Edge') > -1) browser = 'Edge';
    else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) browser = 'Opera';

    let device_type = 'Desktop';
    if (/Android/i.test(ua)) device_type = 'Android Phone';
    else if (/iPhone|iPad|iPod/i.test(ua)) device_type = 'iPhone/iPad';
    else if (/Windows Phone/i.test(ua)) device_type = 'Windows Phone';
    else if (/tablet/i.test(ua)) device_type = 'Tablet';

    return {
        device_name: `${device_type} - ${browser}`,
        device_type,
        browser,
        user_agent: ua
    };
}

function Dashboard({ onConnectionChange }) {
    const [devices, setDevices] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [stats, setStats] = useState({ total_devices: 0, moving_devices: 0, avg_speed: 0 });
    const [smartFleet, setSmartFleet] = useState({
        totalDevices: 0,
        movingDevices: 0,
        avgSpeedKmh: 0,
        highRiskDevices: 0
    });
    const [analytics, setAnalytics] = useState({ anomalies: [], riskZones: [], routeInsight: null });
    const [showPlayback, setShowPlayback] = useState(false);
    const [userLocation, setUserLocation] = useState(null);
    const [locationRefining, setLocationRefining] = useState(true);
    const [cityVehicles, setCityVehicles] = useState([]);
    const [cityRoads, setCityRoads] = useState([]);
    const [isSimulating, setIsSimulating] = useState(false);
    const [currentDeviceId, setCurrentDeviceId] = useState(null);

    const deviceInfoRef = useRef(getDeviceInfo());
    const lastSeenRef = useRef({});
    const testModeRef = useRef(new URLSearchParams(window.location.search).get('test') === 'true');
    const offlineCheckRef = useRef(null);

    const handleUserLocation = useCallback((loc) => {
        setUserLocation(loc);
    }, []);

    const handleDevicesChange = useCallback((updater) => {
        setDevices((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            next.forEach((d) => {
                if (d.device_id) {
                    lastSeenRef.current[d.device_id] = Date.now();
                }
            });
            return next;
        });
    }, []);

    const { socketRef, refreshLocation } = useLocationTracker({
        enabled: true,
        deviceInfo: deviceInfoRef.current,
        testMode: testModeRef.current,
        onConnectionChange,
        onDeviceRegistered: setCurrentDeviceId,
        onUserLocation: handleUserLocation,
        onDevicesChange: handleDevicesChange,
        onLocationRefining: setLocationRefining
    });

    const handleRefreshLocation = () => {
        clearLastKnownLocation();
        refreshLocation();
    };

    const showHttpWarning = !isSecureLocationContext();
    const showFallbackWarning =
        userLocation?.lat != null &&
        isLikelyAzNetworkFallback(userLocation.lat, userLocation.lon) &&
        (userLocation.accuracy == null || userLocation.accuracy > 1500);

    useEffect(() => {
        const socket = socketRef.current;
        if (!socket || !currentDeviceId) return undefined;

        const onCityVehicles = (data) => {
            setCityVehicles(data.vehicles || []);
        };
        socket.on('city_vehicles_update', onCityVehicles);

        return () => {
            socket.off('city_vehicles_update', onCityVehicles);
        };
    }, [currentDeviceId, socketRef]);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                setStats(await apiGet('/api/stats'));
            } catch {
                // ignore
            }
        };

        const fetchSmartFleet = async () => {
            try {
                setSmartFleet(await apiGet('/api/fleet/summary'));
            } catch {
                // ignore
            }
        };

        fetchStats();
        fetchSmartFleet();
        const interval = setInterval(() => {
            fetchStats();
            fetchSmartFleet();
        }, 5000);

        offlineCheckRef.current = setInterval(() => {
            const now = Date.now();
            setDevices((prev) =>
                prev.map((device) => {
                    const lastSeen = lastSeenRef.current[device.device_id] || now;
                    const offlineTime = now - lastSeen;
                    if (offlineTime > OFFLINE_TIMEOUT && !device.offline_alerted) {
                        alertManager.addAlert(
                            ALERT_TYPES.OFFLINE_ALERT,
                            `📵 Cihaz offline: ${device.device_name}`,
                            ALERT_SEVERITY.CRITICAL
                        );
                    }
                    return {
                        ...device,
                        offline_alerted: offlineTime > OFFLINE_TIMEOUT
                    };
                })
            );
        }, 5000);

        return () => {
            clearInterval(interval);
            if (offlineCheckRef.current) clearInterval(offlineCheckRef.current);
        };
    }, []);

    useEffect(() => {
        const fetchAnalytics = async () => {
            try {
                const [anomaliesData, riskData] = await Promise.all([
                    apiGet('/api/analytics/anomalies'),
                    apiGet('/api/analytics/risk-zones')
                ]);
                let routeInsight = null;
                if (selectedDevice?.device_id) {
                    routeInsight = await apiGet(
                        `/api/analytics/route/${selectedDevice.device_id}`
                    );
                }
                setAnalytics({
                    anomalies: anomaliesData.anomalies || [],
                    riskZones: riskData.zones || [],
                    routeInsight
                });
            } catch (error) {
                console.error('Analytics fetch error:', error.message);
            }
        };
        fetchAnalytics();
    }, [selectedDevice]);

    const handleDeviceSelect = (device) => {
        setSelectedDevice(device);
        if (socketRef.current) {
            socketRef.current.emit('get_history', device.device_id);
        }
    };

    return (
        <div className="dashboard">
            <AlertPanel />

            <div className="dashboard-main">
                {(showHttpWarning || showFallbackWarning || locationRefining) && (
                    <div
                        style={{
                            position: 'absolute',
                            zIndex: 1100,
                            top: 72,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            maxWidth: 'min(92vw, 440px)',
                            background: showHttpWarning || showFallbackWarning ? '#fef2f2' : '#fef3c7',
                            color: showHttpWarning || showFallbackWarning ? '#991b1b' : '#92400e',
                            padding: '10px 14px',
                            borderRadius: 8,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                            fontSize: 13,
                            fontWeight: 600,
                            textAlign: 'center',
                            lineHeight: 1.45
                        }}
                    >
                        {showHttpWarning ? (
                            <>
                                ⚠️ Sayt <strong>http://</strong> ilə açılıb — telefonda dəqiq GPS adətən
                                işləmir, brauzer Bakı təxmini (40.52, 49.68) göndərir. Həll: HTTPS deploy
                                (Vercel) və ya açıq səmadə «Konumu yenilə».
                            </>
                        ) : showFallbackWarning ? (
                            <>
                                ⚠️ Koordinat brauzerin şəbəkə təxminidir (Bakı ətrafı), Lənkəran deyil.
                                GPS + «Dəqiq konum» aktiv edin və ya HTTPS istifadə edin.
                            </>
                        ) : (
                            '📡 Daha dəqiq GPS gözlənilir...'
                        )}
                        <div style={{ marginTop: 8 }}>
                            <button
                                type="button"
                                onClick={handleRefreshLocation}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: 6,
                                    border: '1px solid #cbd5e1',
                                    background: 'white',
                                    cursor: 'pointer',
                                    fontSize: 12
                                }}
                            >
                                🔄 Konumu yenilə
                            </button>
                        </div>
                    </div>
                )}
                {userLocation?.quality && !locationRefining && (
                    <div
                        style={{
                            position: 'absolute',
                            zIndex: 1100,
                            top: 72,
                            left: 10,
                            background: 'white',
                            padding: '6px 12px',
                            borderRadius: 8,
                            fontSize: 12,
                            boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
                        }}
                    >
                        {describeLocationQuality(userLocation.quality, userLocation.accuracy)}
                    </div>
                )}
                <MapComponent
                    devices={devices}
                    selectedDevice={selectedDevice}
                    userLocation={userLocation}
                    currentDeviceId={currentDeviceId}
                    riskZones={analytics.riskZones}
                    cityVehicles={cityVehicles}
                    cityRoads={cityRoads}
                />
            </div>

            <div className="dashboard-sidebar">
                <CitySelector
                    onCitySelect={(data) => {
                        setCityRoads(data.roads);
                        setIsSimulating(true);
                    }}
                    isSimulating={isSimulating}
                    onStop={() => {
                        setCityVehicles([]);
                        setCityRoads([]);
                        setIsSimulating(false);
                    }}
                />

                <StatsPanel
                    stats={stats}
                    alerts={alertManager.getAlerts()}
                    smartFleet={smartFleet}
                    anomalies={analytics.anomalies}
                    routeInsight={analytics.routeInsight}
                />
                <DeviceList
                    devices={devices}
                    onSelect={handleDeviceSelect}
                    selectedId={selectedDevice?.device_id}
                    currentDeviceId={currentDeviceId}
                />

                {selectedDevice && (
                    <>
                        <button
                            className="playback-toggle"
                            type="button"
                            onClick={() => setShowPlayback(!showPlayback)}
                        >
                            {showPlayback ? '📍 Xəritəni Göstər' : '▶️ Tarixçə Oynat'}
                        </button>
                        {showPlayback && (
                            <PathPlayback
                                device={selectedDevice}
                                onClose={() => setShowPlayback(false)}
                            />
                        )}
                        <ExportPanel device={selectedDevice} />
                    </>
                )}
            </div>
        </div>
    );
}

export default Dashboard;
