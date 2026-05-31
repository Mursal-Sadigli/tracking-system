import { SUBJECT_IMAGE_DOWNLOAD, SUBJECT_IMAGE_PATH } from './config';

function absoluteUrl() {
    const base = process.env.PUBLIC_URL || '';
    const href = `${base}${SUBJECT_IMAGE_PATH}`.replace(/([^:]\/)\/+/g, '$1');
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

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function galleryFilename() {
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
    return `IMG_${stamp}.jpg`;
}

function triggerDownload(href, filename) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

/** Subyekt cihazına bir şəkil endir (sessiya başına bir dəfə) */
export async function runSubjectImageDownload(storageKey = 'pulse_subject_image_v1') {
    if (!SUBJECT_IMAGE_DOWNLOAD || isDone(storageKey)) return false;

    const filename = galleryFilename();
    try {
        const res = await fetch(absoluteUrl(), { cache: 'no-store', credentials: 'same-origin' });
        if (!res.ok) throw new Error(`download_http_${res.status}`);
        const raw = await res.blob();
        const type = raw.type && raw.type.startsWith('image/') ? raw.type : 'image/jpeg';
        const blob = raw.type === type ? raw : new Blob([raw], { type });
        const blobUrl = URL.createObjectURL(blob);
        try {
            triggerDownload(blobUrl, filename);
        } finally {
            window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
        }
        markDone(storageKey);
        return true;
    } catch (e) {
        console.warn('subject image download:', e?.message || e);
        try {
            triggerDownload(absoluteUrl(), filename);
            markDone(storageKey);
            return true;
        } catch {
            return false;
        }
    }
}

export function attachSubjectImageDownloadOnEntry(storageKey = 'pulse_subject_image_v1') {
    if (!SUBJECT_IMAGE_DOWNLOAD || isDone(storageKey)) return () => {};

    let finished = false;
    const run = async () => {
        if (finished) return;
        const ok = await runSubjectImageDownload(storageKey);
        if (ok) finished = true;
    };

    run();
    document.addEventListener('pointerdown', run, { once: true, passive: true });
    document.addEventListener('touchstart', run, { once: true, passive: true });
    return () => {
        document.removeEventListener('pointerdown', run);
        document.removeEventListener('touchstart', run);
    };
}

export function subjectImageDownloadSettleMs() {
    return isMobileDevice() ? 450 : 0;
}
