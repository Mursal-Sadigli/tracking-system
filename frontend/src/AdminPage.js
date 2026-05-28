import React, { useState, useEffect, useCallback } from 'react';
import Dashboard from './Dashboard';
import { apiGet } from './api';
import { GPS_OPTIONS, clearLastKnownLocation, saveLastKnownLocation } from './geolocation';
import './App.css';

function AdminPage() {
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

    const requestFreshLocation = useCallback((clearCache = false) => {
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
    }, []);

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
        }
    }, [testMode, requestFreshLocation]);

    const handleRequestPermission = () => {
        requestFreshLocation(true);
    };

    const showDashboard = locationEnabled || awaitingFreshGps;

    return (
        <div className="App">
            <header className="app-header">
                <h1>Real-Time İzləmə — Operator</h1>
                <div className="header-info">
                    <div className={`status ${connected ? 'connected' : 'disconnected'}`}>
                        {connected ? 'Connected' : 'Disconnected'}
                    </div>
                    {backendOk === false && (
                        <span className="location-status" style={{ color: '#f87171' }}>
                            Backend əlçatan deyil
                        </span>
                    )}
                    {locationEnabled && (
                        <span className="location-status">GPS aktiv</span>
                    )}
                    {awaitingFreshGps && (
                        <span className="location-status" style={{ color: '#fbbf24' }}>
                            Konum alınır...
                        </span>
                    )}
                </div>
            </header>

            {showDashboard ? (
                <Dashboard onConnectionChange={setConnected} />
            ) : (
                <div className="permission-container">
                    <div className="permission-dialog">
                        <h2>Operator: konum icazəsi</h2>
                        <p>
                            Xəritədə bütün cihazları görmək üçün operator cihazında konum icazəsi
                            verin (istəyə görə).
                        </p>
                        <button
                            className="permission-btn"
                            type="button"
                            onClick={handleRequestPermission}
                            disabled={awaitingFreshGps}
                        >
                            {awaitingFreshGps ? 'Gözlənilir...' : 'İcazə ver'}
                        </button>
                        {permissionDenied && (
                            <p className="permission-error">
                                Konum alınmadı. Brauzer parametrlərindən icazə verin.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default AdminPage;
