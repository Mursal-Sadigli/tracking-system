export function formatDuration(seconds) {
    if (seconds == null || Number.isNaN(seconds)) return '—';
    const m = Math.round(seconds / 60);
    if (m < 60) return `${m} dəq`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return rm ? `${h} sa ${rm} dəq` : `${h} sa`;
}

export function formatDistance(meters) {
    if (meters == null) return '';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
}

export function formatArrivalTime(travelTimeInSeconds) {
    if (travelTimeInSeconds == null || Number.isNaN(travelTimeInSeconds)) return '—';
    const arrival = new Date(Date.now() + travelTimeInSeconds * 1000);
    return arrival.toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatTrafficDelayMinutes(trafficDelayInSeconds) {
    if (trafficDelayInSeconds == null || Number.isNaN(trafficDelayInSeconds)) return null;
    const minutes = Math.max(0, Math.round(trafficDelayInSeconds / 60));
    if (minutes <= 0) return 'Trafik gecikməsi yoxdur';
    return `+${minutes} dəq trafik`;
}

export function movedEnough(a, b, thresholdM = 80) {
    if (!a || !b) return true;
    const dlat = (a.lat - b.lat) * 111320;
    const dlon = (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180);
    return Math.hypot(dlat, dlon) > thresholdM;
}
