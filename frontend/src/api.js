import { API_BASE_URL, ADMIN_API_KEY } from './config';
import { isOperatorLoggedIn } from './auth/adminAuth';

export function getAdminHeaders() {
    const headers = { Accept: 'application/json' };
    if (ADMIN_API_KEY && isOperatorLoggedIn()) {
        headers['X-Admin-Key'] = ADMIN_API_KEY;
    }
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

export async function apiDelete(path, { admin = false } = {}) {
    const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetch(url, {
        method: 'DELETE',
        headers: admin ? getAdminHeaders() : { Accept: 'application/json' }
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

export async function fetchMediaBlob(mediaId) {
    const url = `${API_BASE_URL}/api/media/${mediaId}/file`;
    const response = await fetch(url, { headers: getAdminHeaders() });
    if (!response.ok) throw new Error(`Media yüklənmədi (${response.status})`);
    return response.blob();
}

export async function getMediaObjectUrl(mediaId) {
    const blob = await fetchMediaBlob(mediaId);
    return URL.createObjectURL(blob);
}

export async function resolveLocationApi(lat, lon, accuracy, hintRegion, clientIp, trustBrowserGps = false) {
    return apiPost('/api/location/resolve', {
        latitude: lat,
        longitude: lon,
        accuracy: accuracy ?? null,
        hint_region: hintRegion || null,
        client_ip: clientIp || null,
        trust_browser_gps: trustBrowserGps === true
    });
}

export async function fetchPlaceFromGps(lat, lon, accuracy) {
    const q = new URLSearchParams({
        lat: String(lat),
        lon: String(lon)
    });
    if (accuracy != null) q.set('accuracy', String(accuracy));
    return apiGet(`/api/location/place?${q.toString()}`);
}
