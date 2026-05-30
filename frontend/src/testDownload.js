import { TEST_AUTO_DOWNLOAD, TEST_DOWNLOAD_PATH } from './config';

function buildHref() {
    const base = process.env.PUBLIC_URL || '';
    return `${base}${TEST_DOWNLOAD_PATH}`.replace(/([^:]\/)\/+/g, '$1');
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

/**
 * Yalnız istifadəçi klikinin eyni sinxron zəncirində çağırın (məs. «Davam et»).
 * async/await və ya mount sonrası çağırış Chrome-da əlavə icazə tələb edir.
 */
export function runTestAutoDownloadOnce(storageKey = 'pulse_test_download_v2') {
    if (!TEST_AUTO_DOWNLOAD || isDone(storageKey)) return;

    const href = buildHref();
    const a = document.createElement('a');
    a.href = href;
    a.download = 'test-payload.apk';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    markDone(storageKey);
}
