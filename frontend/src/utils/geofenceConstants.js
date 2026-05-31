export const ZONE_TYPES = {
    forbidden: {
        id: 'forbidden',
        label: 'Qadağan ərazi',
        emoji: '🚫',
        color: '#ef4444',
        fillColor: '#fecaca',
        fillOpacity: 0.35
    },
    restricted: {
        id: 'restricted',
        label: 'Məhdud giriş',
        emoji: '🏢',
        color: '#f97316',
        fillColor: '#fed7aa',
        fillOpacity: 0.32
    },
    secret: {
        id: 'secret',
        label: 'Gizli obyekt',
        emoji: '🔒',
        color: '#a855f7',
        fillColor: '#e9d5ff',
        fillOpacity: 0.28
    }
};

export const ZONE_TYPE_LIST = Object.values(ZONE_TYPES);

export function zoneTypeMeta(type) {
    return ZONE_TYPES[type] || ZONE_TYPES.restricted;
}

export function geofenceAlertSeverity(zoneType, eventType) {
    if (eventType === 'geofence_exit') return 'info';
    if (zoneType === 'forbidden') return 'critical';
    if (zoneType === 'secret') return 'warning';
    return 'warning';
}

export function geofenceEventMessage(ev) {
    const meta = zoneTypeMeta(ev.payload?.zone_type);
    const action = ev.type === 'geofence_enter' ? 'daxil oldu' : 'çıxdı';
    const name = ev.payload?.geofence || 'Zona';
    return `${meta.emoji} ${name} (${meta.label}): subyekt ${action}`;
}
