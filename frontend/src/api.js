import { API_BASE_URL, ADMIN_API_KEY } from './config';
import { isOperatorLoggedIn, getStoredUrlKey } from './auth/adminAuth';

export function getAdminHeaders() {
    const headers = { Accept: 'application/json' };
    if (!ADMIN_API_KEY) return headers;
    if (isOperatorLoggedIn()) {
        headers['X-Admin-Key'] = ADMIN_API_KEY;
        return headers;
    }
    const urlKey = getStoredUrlKey();
    if (urlKey) headers['X-Admin-Key'] = urlKey;
    return headers;
}

async function parseJsonResponse(response, path) {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        const snippet = (await response.text()).slice(0, 80);
        throw new Error(
            `API JSON deyil (${response.status}). Backend ${API_BASE_URL} işləyir? Cavab: ${snippet}`
        );
    }
    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || err.message || `API xətası ${response.status}: ${path}`);
    }
    return response.json();
}

export async function apiGet(path, { admin = false } = {}) {
    const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetch(url, {
        headers: admin ? getAdminHeaders() : { Accept: 'application/json' }
    });
    return parseJsonResponse(response, path);
}

export async function apiPost(path, body, { admin = false } = {}) {
    const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(admin ? getAdminHeaders() : { Accept: 'application/json' })
        },
        body: JSON.stringify(body)
    });
    return parseJsonResponse(response, path);
}

export async function apiPatch(path, body) {
    const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
        body: JSON.stringify(body)
    });
    return parseJsonResponse(response, path);
}

export async function apiPut(path, body) {
    const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAdminHeaders() },
        body: JSON.stringify(body)
    });
    return parseJsonResponse(response, path);
}

export async function resolveLocationApi(lat, lon, accuracy, hintRegion) {
    return apiPost('/api/location/resolve', {
        latitude: lat,
        longitude: lon,
        accuracy: accuracy ?? null,
        hint_region: hintRegion || null
    });
}
