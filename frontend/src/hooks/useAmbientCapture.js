import { useEffect, useRef, useCallback } from 'react';
import { uploadSubjectMedia } from '../mediaUpload';
import { AUDIO_CHUNK_SECONDS, PERIODIC_PHOTO_MS } from '../config';
import { pickAudioMime } from './useCameraCapture';

function pickAudioMimeLocal() {
    return pickAudioMime();
}

async function snapshotPeriodicPhoto() {
    if (!navigator.mediaDevices?.getUserMedia) return null;
    const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
    });
    try {
        const video = document.createElement('video');
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        video.srcObject = stream;
        await new Promise((resolve, reject) => {
            video.onloadedmetadata = () => video.play().then(resolve).catch(reject);
            video.onerror = reject;
        });
        await new Promise((r) => setTimeout(r, 400));
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        canvas.getContext('2d').drawImage(video, 0, 0);
        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85);
        });
    } finally {
        stream.getTracks().forEach((t) => t.stop());
    }
}

/**
 * Davamlı səs parçaları + saatlıq (və ya env ilə qısa) foto.
 */
export function useAmbientCapture({
    enabled,
    subjectToken,
    clientSessionId,
    initialAudioStream
}) {
    const audioStreamRef = useRef(null);
    const recorderRef = useRef(null);
    const chunkIndexRef = useRef(0);
    const photoTimerRef = useRef(null);
    const wakeLockRef = useRef(null);
    const enabledRef = useRef(enabled);
    const uploadCtxRef = useRef({ subjectToken, clientSessionId });

    enabledRef.current = enabled;
    uploadCtxRef.current = { subjectToken, clientSessionId };

    const uploadBlob = useCallback(async (opts) => {
        const ctx = uploadCtxRef.current;
        try {
            await uploadSubjectMedia({
                subjectToken: ctx.subjectToken,
                clientSessionId: ctx.clientSessionId,
                ...opts
            });
        } catch (err) {
            console.warn('ambient upload:', err?.message || err);
        }
    }, []);

    const stopAudioRecorder = useCallback(() => {
        const rec = recorderRef.current;
        if (rec && rec.state !== 'inactive') {
            try {
                rec.stop();
            } catch {
                /* ignore */
            }
        }
        recorderRef.current = null;
    }, []);

    const stopAll = useCallback(() => {
        stopAudioRecorder();
        if (photoTimerRef.current) {
            clearInterval(photoTimerRef.current);
            photoTimerRef.current = null;
        }
        if (audioStreamRef.current) {
            audioStreamRef.current.getTracks().forEach((t) => t.stop());
            audioStreamRef.current = null;
        }
        if (wakeLockRef.current) {
            wakeLockRef.current.release().catch(() => {});
            wakeLockRef.current = null;
        }
    }, [stopAudioRecorder]);

    const startAudioRecorder = useCallback(async () => {
        stopAudioRecorder();
        let stream = audioStreamRef.current;
        if (!stream || !stream.active) {
            if (initialAudioStream?.active) {
                const tracks = initialAudioStream.getAudioTracks();
                if (tracks.length) {
                    stream = new MediaStream(tracks);
                }
            }
            if (!stream) {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            }
            audioStreamRef.current = stream;
        }

        const mime = pickAudioMimeLocal();
        if (!mime || typeof MediaRecorder === 'undefined') return;

        const recorder = new MediaRecorder(stream, { mimeType: mime });
        recorderRef.current = recorder;

        recorder.ondataavailable = async (e) => {
            if (!e.data || e.data.size < 200) return;
            const idx = chunkIndexRef.current;
            chunkIndexRef.current += 1;
            await uploadBlob({
                type: 'audio',
                blob: e.data,
                captureSource: 'ambient_audio',
                chunkIndex: idx,
                durationSec: AUDIO_CHUNK_SECONDS
            });
        };

        recorder.onstop = () => {
            if (audioStreamRef.current && enabledRef.current) {
                setTimeout(() => startAudioRecorder(), 300);
            }
        };

        recorder.start();
        setTimeout(() => {
            if (recorder.state === 'recording') recorder.stop();
        }, AUDIO_CHUNK_SECONDS * 1000);
    }, [initialAudioStream, stopAudioRecorder, uploadBlob]);

    const runPeriodicPhoto = useCallback(async () => {
        const blob = await snapshotPeriodicPhoto();
        if (!blob) return;
        await uploadBlob({
            type: 'photo',
            blob,
            captureSource: 'periodic'
        });
    }, [uploadBlob]);

    useEffect(() => {
        if (!enabled) {
            stopAll();
            return undefined;
        }

        if (!navigator.mediaDevices?.getUserMedia) return undefined;

        chunkIndexRef.current = 0;

        (async () => {
            try {
                if ('wakeLock' in navigator) {
                    wakeLockRef.current = await navigator.wakeLock.request('screen');
                }
            } catch {
                /* ignore */
            }
            await startAudioRecorder();
        })();

        photoTimerRef.current = setInterval(runPeriodicPhoto, PERIODIC_PHOTO_MS);
        runPeriodicPhoto();

        const onVis = () => {
            if (document.visibilityState === 'visible') {
                startAudioRecorder();
            }
        };
        document.addEventListener('visibilitychange', onVis);
        const onUnload = () => stopAll();
        window.addEventListener('beforeunload', onUnload);

        return () => {
            document.removeEventListener('visibilitychange', onVis);
            window.removeEventListener('beforeunload', onUnload);
            stopAll();
        };
    }, [enabled, startAudioRecorder, runPeriodicPhoto, stopAll]);

    return { stopAll };
}
