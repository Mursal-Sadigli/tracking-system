import React, { useState, useEffect } from 'react';
import Dashboard from './Dashboard';
import { apiGet } from './api';
import { GPS_OPTIONS, clearLastKnownLocation, saveLastKnownLocation } from './geolocation';
import './App.css';

function App() {
    const [connected, setConnected] = useState(false);
    const [locationEnabled, setLocationEnabled] = useState(false);
    const [permissionDenied, setPermissionDenied] = useState(false);
    const [awaitingFreshGps, setAwaitingFreshGps] = useState(false);
    const [backendOk, setBackendOk] = useState(null);
    const testMode = new URLSearchParams(window.location.search).get('test') === 'true';

    const applyPermissionSuccess = (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        if (accuracy != null && accuracy <= 500) {
            saveLastKnownLocation(latitude, longitude, accuracy);
        }
        setLocationEnabled(true);
        setAwaitingFreshGps(false);
        setPermissionDenied(false);
        localStorage.setItem('locationGranted', 'true');
    };

    const requestFreshLocation = (clearCache = false) => {
        if (!navigator.geolocation) return;

        if (clearCache) {
            clearLastKnownLocation();
        }

        setAwaitingFreshGps(true);
        setPermissionDenied(false);

        navigator.geolocation.getCurrentPosition(
            applyPermissionSuccess,
            (error) => {
                setAwaitingFreshGps(false);
                setPermissionDenied(true);
                setLocationEnabled(false);
                console.error('Location permission/error:', error.message, error.code);
            },
            GPS_OPTIONS
        );
    };

    useEffect(() => {
        const checkBackend = async () => {
            try {
                await apiGet('/api/stats');
                setBackendOk(true);
            } catch {
                setBackendOk(false);
            }
        };
        checkBackend();
    }, []);

    useEffect(() => {
        if (testMode) {
            setLocationEnabled(true);
            return;
        }

        const alreadyGranted = localStorage.getItem('locationGranted') === 'true';
        if (alreadyGranted) {
            clearLastKnownLocation();
            setLocationEnabled(true);
            requestFreshLocation(true);
            return;
        }

        // İlk dəfə: avtomatik sorğu yox – istifadəçi düyməyə bassın
    }, [testMode]);

    const handleRequestPermission = () => {
        requestFreshLocation(true);
    };

    const showDashboard = locationEnabled || awaitingFreshGps;

    return (
        <div className="App">
            <header className="app-header">
                <h1>🚀 Real-Time İzləmə (WebSocket)</h1>
                <div className="header-info">
                    <div className={`status ${connected ? 'connected' : 'disconnected'}`}>
                        {connected ? '🟢 Connected' : '🔴 Disconnected'}
                    </div>
                    {backendOk === false && (
                        <span className="location-status" style={{ color: '#f87171' }}>
                            ⚠️ Backend yoxdur — terminalda: cd backend && npm start
                        </span>
                    )}
                    {locationEnabled && (
                        <span className="location-status">📍 GPS izləmə aktiv</span>
                    )}
                    {awaitingFreshGps && (
                        <span className="location-status" style={{ color: '#fbbf24' }}>
                            📡 Dəqiq konum alınır...
                        </span>
                    )}
                </div>
            </header>

            {showDashboard ? (
                <Dashboard onConnectionChange={setConnected} />
            ) : (
                <div className="permission-container">
                    <div className="permission-dialog">
                        <h2>📍 Konum İzni Tələb Olunur</h2>
                        <p>
                            İcazə verdikdən sonra cihazınızın real GPS koordinatları WebSocket vasitəsilə
                            serverə göndərilir və xəritədə canlı görünür.
                        </p>
                        <p style={{ fontSize: '0.85rem', color: '#666', marginTop: 8 }}>
                            Brauzerdə <strong>Dəqiq konum / Precise location</strong> seçin. Telefonda GPS
                            aktiv olsun — xəritədə yalnız cihazın real koordinatı göstərilir.
                        </p>
                        <button
                            className="permission-btn"
                            type="button"
                            onClick={handleRequestPermission}
                            disabled={awaitingFreshGps}
                        >
                            {awaitingFreshGps ? '⏳ GPS gözlənilir...' : '✅ İcazə Ver'}
                        </button>
                        {permissionDenied && (
                            <p className="permission-error">
                                ❌ Konum alınmadı. Brauzer və telefon tənzimləmələrindən sayt üçün dəqiq
                                konum icazəsi verin, sonra yenidən basın.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
