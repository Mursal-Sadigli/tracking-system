import React, { useState, useEffect } from 'react';
import { apiGet } from '../api';
import './IntelPanel.css';

function IntelPanel({ selectedCaseId }) {
    const [profile, setProfile] = useState(null);
    const [coLocation, setCoLocation] = useState([]);
    const [heatmap, setHeatmap] = useState([]);

    useEffect(() => {
        if (!selectedCaseId) return;
        apiGet(`/api/intel/profile/${selectedCaseId}`, { admin: true })
            .then(setProfile)
            .catch(() => {});
    }, [selectedCaseId]);

    useEffect(() => {
        apiGet('/api/intel/co-location', { admin: true })
            .then((d) => setCoLocation(d.events || []))
            .catch(() => {});
        apiGet('/api/intel/heatmap', { admin: true })
            .then((d) => setHeatmap(d.heatmap || []))
            .catch(() => {});
    }, []);

    if (!selectedCaseId) {
        return <p className="intel-panel__hint">Case seçin — davranış profili</p>;
    }

    return (
        <div className="intel-panel">
            <h2>Kəşfiyyat / Analitika</h2>

            {profile && (
                <section>
                    <h3>Davranış profili</h3>
                    <p>{profile.summary_az}</p>
                    <p>Risk: {profile.risk_level} | Skor: {profile.score}</p>
                    <p>Rutin skoru: {profile.routine_score}</p>
                    <h4>Dayanma zonaları</h4>
                    <ul>
                        {(profile.dwell_zones || []).map((z) => (
                            <li key={z.label}>
                                {z.label}: {z.dwell_count} nöqtə ({z.lat?.toFixed(4)}, {z.lon?.toFixed(4)})
                            </li>
                        ))}
                    </ul>
                    <h4>Anomaliyalar</h4>
                    <ul>
                        {(profile.anomalies || []).slice(0, 8).map((a, i) => (
                            <li key={i}>
                                {a.explanation_az || a.type} — {a.severity}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section>
                <h3>Co-location</h3>
                {coLocation.length === 0 ? (
                    <p>Kəsişmə yoxdur</p>
                ) : (
                    <ul>
                        {coLocation.slice(0, 10).map((e) => (
                            <li key={e.key}>
                                {e.device_a} ↔ {e.device_b} ({e.distance_m}m)
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <section>
                <h3>Heatmap (son nöqtələr)</h3>
                <p>{heatmap.length} isti nöqtə</p>
            </section>
        </div>
    );
}

export default IntelPanel;
