/** Brauzer Geolocation API */
export const GPS_OPTIONS = {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 60000
};

export const GPS_WATCH_OPTIONS = {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 120000
};

export const STORAGE_KEY = 'tracking_last_known_location';
export const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

export function getLocationQuality(accuracy) {
    if (accuracy == null || Number.isNaN(accuracy)) {
        return 'unknown';
    }
    if (accuracy <= 100) {
        return 'gps';
    }
    if (accuracy <= 500) {
        return 'approximate';
    }
    if (accuracy <= 1500) {
        return 'network';
    }
    return 'poor';
}

export function googleMapsUrl(lat, lon) {
    return `https://www.google.com/maps?q=${lat},${lon}`;
}

export function clearLastKnownLocation() {
    try {
        sessionStorage.removeItem(STORAGE_KEY);
    } catch {
        // ignore
    }
}

export function isLocationCacheFresh(data, maxAgeMs = CACHE_MAX_AGE_MS) {
    if (!data?.savedAt) return false;
    return Date.now() - data.savedAt < maxAgeMs;
}

export function shouldAcceptGpsPosition({ latitude, longitude }) {
    return (
        latitude != null &&
        longitude != null &&
        !Number.isNaN(latitude) &&
        !Number.isNaN(longitude)
    );
}

/** Brauzer HTTP-də tez-tez verdiyi Azərbaycan şəbəkə təxmini (Bakı ətrafı) */
export function isLikelyAzNetworkFallback(lat, lon) {
    return haversineMeters(lat, lon, 40.52, 49.68) < 3000;
}

export function isSecureLocationContext() {
    return typeof window !== 'undefined' && window.isSecureContext === true;
}

/** Yeni oxunuş əvvəlkindən daha yaxşıdırsa (və ya ilk oxunuşdursa) xəritəni yenilə */
export function shouldUpdateDisplayedPosition(
    { latitude, longitude, accuracy },
    state
) {
    if (!shouldAcceptGpsPosition({ latitude, longitude })) {
        return false;
    }

    const acc = Number.isFinite(accuracy) ? accuracy : Infinity;

    if (state.bestAccuracy == null || !Number.isFinite(state.bestAccuracy)) {
        state.bestAccuracy = acc;
        state.lastLat = latitude;
        state.lastLon = longitude;
        return true;
    }

    if (acc < state.bestAccuracy) {
        state.bestAccuracy = acc;
        state.lastLat = latitude;
        state.lastLon = longitude;
        return true;
    }

    const moved = haversineMeters(state.lastLat, state.lastLon, latitude, longitude);
    if (moved >= 30 && acc <= state.bestAccuracy * 1.5) {
        state.lastLat = latitude;
        state.lastLon = longitude;
        return true;
    }

    return false;
}

export function describeLocationQuality(quality, accuracy) {
    const meters = accuracy != null ? ` (±${Math.round(accuracy)} m)` : '';
    switch (quality) {
        case 'gps':
            return `GPS${meters}`;
        case 'approximate':
            return `Yaxın lokasiya${meters}`;
        case 'network':
            return `Şəbəkə təxmini${meters}`;
        case 'poor':
            return `Təxmini${meters}`;
        default:
            return `Konum${meters}`;
    }
}

export function saveLastKnownLocation(lat, lon, accuracy) {
    try {
        sessionStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({ lat, lon, accuracy, savedAt: Date.now() })
        );
    } catch {
        // ignore
    }
}

export function loadLastKnownLocation() {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (data?.lat == null || data?.lon == null) return null;
        if (!isLocationCacheFresh(data)) {
            sessionStorage.removeItem(STORAGE_KEY);
            return null;
        }
        return data;
    } catch {
        return null;
    }
}

export function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
