import React from 'react';
import { zoneTypeMeta } from '../utils/geofenceConstants';

const LABELS = {
    consent_granted: 'İcazə verildi',
    geofence_enter: 'Zonaya daxil oldu',
    geofence_exit: 'Zonadan çıxdı',
    corridor_exit: 'Koridordan çıxdı',
    speed_exceeded: 'Sürət limiti',
    phase_completed: 'Faza tamamlandı',
    subject_offline: 'Offline',
    ai_anomaly: 'AI anomaliya',
    co_location_meeting: 'Co-location / görüş',
    briefing_updated: 'Briefing yeniləndi',
    media_captured: 'Kamera media',
    note: 'Qeyd'
};

function CaseTimeline({ events }) {
    if (!events?.length) {
        return <p className="case-timeline__empty">Hadisə yoxdur</p>;
    }

    return (
        <ul className="case-timeline">
            {events.map((ev) => {
                const zoneType = ev.payload?.zone_type;
                const zoneMeta = zoneType ? zoneTypeMeta(zoneType) : null;
                const itemClass = [
                    'case-timeline__item',
                    `case-timeline__item--${ev.type}`,
                    zoneType ? `case-timeline__item--${zoneType}` : ''
                ]
                    .filter(Boolean)
                    .join(' ');

                return (
                    <li key={ev.id} className={itemClass}>
                        <span className="case-timeline__time">
                            {new Date(ev.ts).toLocaleTimeString('az-AZ')}
                        </span>
                        <span className="case-timeline__label">
                            {zoneMeta && (ev.type === 'geofence_enter' || ev.type === 'geofence_exit')
                                ? `${zoneMeta.emoji} `
                                : ''}
                            {LABELS[ev.type] || ev.type}
                        </span>
                        {ev.payload?.geofence && (
                            <span className="case-timeline__meta">
                                {ev.payload.geofence}
                                {zoneMeta ? ` • ${zoneMeta.label}` : ''}
                            </span>
                        )}
                        {ev.payload?.speed_kmh != null && (
                            <span className="case-timeline__meta">{ev.payload.speed_kmh} km/s</span>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

export default CaseTimeline;
