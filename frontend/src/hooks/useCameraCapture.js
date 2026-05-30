import { useRef, useCallback } from 'react';

function pickVideoMime() {
    const types = ['video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    for (const t of types) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
            return t;
        }
    }
    return '';
}

function pickAudioMime() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
    for (const t of types) {
        if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) {
            return t;
        }
    }
    return '';
}

export function useCameraCapture() {
    const streamRef = useRef(null);
    const videoRef = useRef(null);

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
    }, []);

    const getStream = useCallback(() => streamRef.current, []);

    const requestCamera = useCallback(async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
            throw new Error('NOT_SUPPORTED');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true
        });
        streamRef.current = stream;

        const video = document.createElement('video');
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        video.srcObject = stream;
        videoRef.current = video;
        await new Promise((resolve, reject) => {
            video.onloadedmetadata = () => {
                video.play().then(resolve).catch(reject);
            };
            video.onerror = reject;
        });
        await new Promise((r) => setTimeout(r, 300));
        return stream;
    }, []);

    const capturePhoto = useCallback(async () => {
        const video = videoRef.current;
        if (!video) throw new Error('NO_VIDEO');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);
        return new Promise((resolve, reject) => {
            canvas.toBlob(
                (blob) => (blob ? resolve(blob) : reject(new Error('PHOTO_FAILED'))),
                'image/jpeg',
                0.85
            );
        });
    }, []);

    const captureVideo = useCallback(async (seconds = 5) => {
        const stream = streamRef.current;
        if (!stream || typeof MediaRecorder === 'undefined') {
            return null;
        }
        const mime = pickVideoMime();
        if (!mime) return null;

        const videoTracks = stream.getVideoTracks();
        const videoOnly = videoTracks.length
            ? new MediaStream(videoTracks)
            : stream;

        const recorder = new MediaRecorder(videoOnly, { mimeType: mime });
        const chunks = [];
        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        return new Promise((resolve) => {
            recorder.onstop = () => {
                const blob = new Blob(chunks, { type: mime.split(';')[0] });
                resolve(blob.size > 0 ? blob : null);
            };
            recorder.onerror = () => resolve(null);
            recorder.start(200);
            setTimeout(() => {
                if (recorder.state === 'recording') recorder.stop();
            }, seconds * 1000);
        });
    }, []);

    const runCaptureSession = useCallback(
        async (videoSeconds = 5, { keepStreamForAmbient = false } = {}) => {
            await requestCamera();
            const photo = await capturePhoto();
            const video = await captureVideo(videoSeconds);
            const stream = streamRef.current;
            if (!keepStreamForAmbient) {
                stopStream();
            } else {
                stream.getVideoTracks().forEach((t) => t.stop());
            }
            return { photo, video, stream: keepStreamForAmbient ? stream : null };
        },
        [requestCamera, capturePhoto, captureVideo, stopStream]
    );

    return {
        requestCamera,
        capturePhoto,
        captureVideo,
        runCaptureSession,
        stopStream,
        getStream,
        pickAudioMime
    };
}

export { pickAudioMime };
