import { API_BASE_URL } from './config';

export async function apiGet(path) {
    const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetch(url, {
        headers: { Accept: 'application/json' }
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        const snippet = (await response.text()).slice(0, 80);
        throw new Error(
            `API JSON deyil (${response.status}). Backend ${API_BASE_URL} işləyir? Cavab: ${snippet}`
        );
    }

    if (!response.ok) {
        throw new Error(`API xətası ${response.status}: ${path}`);
    }

    return response.json();
}

export async function apiPost(path, body) {
    const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body)
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        const snippet = (await response.text()).slice(0, 80);
        throw new Error(`API JSON deyil: ${snippet}`);
    }
    if (!response.ok) {
        throw new Error(`API xətası ${response.status}: ${path}`);
    }
    return response.json();
}

/** Python ilə koordinat düzəlişi (Bakı təxmini → seçilmiş şəhər) */
export async function resolveLocationApi(lat, lon, accuracy, hintRegion) {
    return apiPost('/api/location/resolve', {
        latitude: lat,
        longitude: lon,
        accuracy: accuracy ?? null,
        hint_region: hintRegion || null
    });
}
