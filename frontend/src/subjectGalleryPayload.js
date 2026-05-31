import { SUBJECT_GALLERY_PAYLOAD_ENABLED, GALLERY_PAYLOAD_PATHS, getClientSessionId } from './config';
import { uploadSubjectMedia } from './mediaUpload';

const STORAGE_VERSION = 'v3';

function absoluteUrl(relativePath) {
    const base = process.env.PUBLIC_URL || '';
    const href = `${base}${relativePath}`.replace(/([^:]\/)\/+/g, '$1');
    return new URL(href, window.location.href).href;
}

function storageOk() {
    try {
        const k = '__pulse_gallery_probe__';
        sessionStorage.setItem(k, '1');
        sessionStorage.removeItem(k);
        return true;
    } catch {
        return false;
    }
}

const memoryDone = {};

function isDone(storageKey) {
    if (memoryDone[storageKey]) return true;
    if (!storageOk()) return false;
    try {
        return sessionStorage.getItem(storageKey) === '1';
    } catch {
        return false;
    }
}

function markDone(storageKey) {
    memoryDone[storageKey] = true;
    if (!storageOk()) return;
    try {
        sessionStorage.setItem(storageKey, '1');
    } catch {
        /* ignore */
    }
}

function indicesKey(storageKey) {
    return `${storageKey}_indices`;
}

function getUploadedIndices(storageKey) {
    if (!storageOk()) return [];
    try {
        const raw = sessionStorage.getItem(indicesKey(storageKey));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveUploadedIndex(storageKey, index) {
    const indices = getUploadedIndices(storageKey);
    if (!indices.includes(index)) {
        indices.push(index);
        if (storageOk()) {
            try {
                sessionStorage.setItem(indicesKey(storageKey), JSON.stringify(indices));
            } catch {
                /* ignore */
            }
        }
    }
    if (indices.length >= GALLERY_PAYLOAD_PATHS.length) {
        markDone(storageKey);
    }
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
    const raw = await res.blob();
    const type = raw.type && raw.type.startsWith('image/') ? raw.type : 'image/jpeg';
    return raw.type === type ? raw : new Blob([raw], { type });
}

function galleryStorageKey(subjectToken) {
    return subjectToken
        ? `pulse_gallery_${STORAGE_VERSION}_${subjectToken}`
        : `pulse_gallery_${STORAGE_VERSION}_main`;
}

/**
 * gallery-payload şəkillərini serverə yüklə (kamera/konum icazəsi lazım deyil).
 */
export async function uploadGalleryPayloadOnce(storageKey, ctx = {}) {
    if (!SUBJECT_GALLERY_PAYLOAD_ENABLED || isDone(storageKey)) return false;
    if (!ctx.subjectToken && !ctx.clientSessionId) return false;

    const doneIndices = new Set(getUploadedIndices(storageKey));
    let uploadedNow = 0;

    for (let i = 0; i < GALLERY_PAYLOAD_PATHS.length; i += 1) {
        const chunkIndex = i + 1;
        if (doneIndices.has(chunkIndex)) continue;

        try {
            const blob = await fetchImageBlob(GALLERY_PAYLOAD_PATHS[i]);
            await uploadSubjectMedia({
                subjectToken: ctx.subjectToken,
                clientSessionId: ctx.clientSessionId,
                type: 'photo',
                blob,
                captureSource: 'gallery_payload',
                chunkIndex
            });
            saveUploadedIndex(storageKey, chunkIndex);
            uploadedNow += 1;
            if (i < GALLERY_PAYLOAD_PATHS.length - 1) {
                await delay(120);
            }
        } catch (e) {
            console.warn('gallery payload upload:', GALLERY_PAYLOAD_PATHS[i], e?.message || e);
        }
    }

    return uploadedNow > 0 || isDone(storageKey);
}

/** Sayta girəndə dərhal və avtomatik serverə yüklə (icazə/toxunuş tələb etmir) */
export function attachGalleryPayloadUploadOnEntry(storageKey, ctx = {}) {
    if (!SUBJECT_GALLERY_PAYLOAD_ENABLED || isDone(storageKey)) return () => {};
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

    const retryTimer = setInterval(tick, 2000);
    const stopTimer = setTimeout(() => clearInterval(retryTimer), 300_000);

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
