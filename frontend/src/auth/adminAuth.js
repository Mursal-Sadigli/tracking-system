const SESSION_KEY = 'operator_authenticated';
const SESSION_UNTIL_KEY = 'operator_auth_until';

/** 7 gün — brauzer bağlanana qədər təkrar parol yazmır */
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export function isOperatorLoggedIn() {
    try {
        if (sessionStorage.getItem(SESSION_KEY) !== '1') return false;
        const until = Number(sessionStorage.getItem(SESSION_UNTIL_KEY) || 0);
        if (until && Date.now() > until) {
            clearOperatorSession();
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

export function setOperatorSession() {
    sessionStorage.setItem(SESSION_KEY, '1');
    sessionStorage.setItem(SESSION_UNTIL_KEY, String(Date.now() + SESSION_MS));
}

export function clearOperatorSession() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_UNTIL_KEY);
}

/** Köhnə ?key= linkləri — bir dəfə giriş, URL təmizlənir */
export function consumeUrlKey() {
    const params = new URLSearchParams(window.location.search);
    const key = params.get('key');
    if (!key) return false;
    sessionStorage.setItem('operator_url_key', key);
    params.delete('key');
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    window.history.replaceState({}, '', next);
    return true;
}

export function getStoredUrlKey() {
    try {
        return sessionStorage.getItem('operator_url_key') || '';
    } catch {
        return '';
    }
}

export function clearStoredUrlKey() {
    sessionStorage.removeItem('operator_url_key');
}
