import React, { useEffect, useState } from 'react';
import { apiGet } from '../api';
import './VisitHistory.css';

function VisitHistory() {
    const [visits, setVisits] = useState([]);

    useEffect(() => {
        const load = () => {
            apiGet('/api/visits?limit=50', { admin: true })
                .then((d) => setVisits(d.visits || []))
                .catch(() => {});
        };
        load();
        const t = setInterval(load, 20000);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="visit-history">
            <h3>Qısa ziyarətlər (tarixçə)</h3>
            <p className="visit-history__hint">Tez çıxan və ya icazə verməyən ziyarətlər</p>
            <ul>
                {visits.length === 0 && <li className="visit-history__empty">Hələ qeyd yoxdur</li>}
                {visits.map((v) => (
                    <li key={v.id} className={v.brief ? 'is-brief' : ''}>
                        <div className="visit-history__row">
                            <strong>{v.brief ? 'Qısa çıxış' : 'Ziyarət'}</strong>
                            <span>{v.duration_sec}s</span>
                        </div>
                        <div className="visit-history__meta">
                            {v.ip && <span>IP: {v.ip}</span>}
                            {v.isp && <span> • {v.isp}</span>}
                        </div>
                        <div className="visit-history__meta">
                            {v.consent_granted ? '✓ İcazə' : '✗ İcazə yox'}
                            {v.camera_granted ? ' • 📷 Kamera' : ''}
                            {v.media_photo ? ' • Foto' : ''}
                            {v.media_video ? ' • Video' : ''} • GPS: {v.gps_points} •{' '}
                            {v.browser || v.device_type || '—'}
                        </div>
                        <div className="visit-history__time">
                            {new Date(v.started_at).toLocaleString('az-AZ')}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export default VisitHistory;
