import React, { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../api';
import { getTrackingSocket } from '../socketService';
import RiskBadge from './RiskBadge';
import RiskTrend from './RiskTrend';
import AnomalyRulesPanel from './AnomalyRulesPanel';
import './IntelPanel.css';

function IntelPanel({ selectedCaseId, onRoutineZones }) {
    const [profile, setProfile] = useState(null);
    const [coLocation, setCoLocation] = useState([]);
    const [heatmap, setHeatmap] = useState([]);
    const [risk, setRisk] = useState(null);
    const [routine, setRoutine] = useState(null);
    const [subTab, setSubTab] = useState('risk');

    const loadRisk = useCallback(async () => {
        if (!selectedCaseId) return;
        try {
            const snap = await apiGet(`/api/intel/risk/${selectedCaseId}`, { admin: true });
            setRisk(snap);
        } catch {
            setRisk(null);
        }
    }, [selectedCaseId]);

    const loadRoutine = useCallback(
        async (refresh = false) => {
            if (!selectedCaseId) return;
            try {
                const path = `/api/intel/routine-zones/${selectedCaseId}${refresh ? '?refresh=1' : ''}`;
                const data = await apiGet(path, { admin: true });
                setRoutine(data);
                onRoutineZones?.(data.zones || []);
            } catch {
                setRoutine(null);
            }
        },
        [selectedCaseId, onRoutineZones]
    );

    useEffect(() => {
        if (!selectedCaseId) return;
        apiGet(`/api/intel/profile/${selectedCaseId}`, { admin: true })
            .then(setProfile)
            .catch(() => setProfile(null));
        loadRisk();
        loadRoutine();
    }, [selectedCaseId, loadRisk, loadRoutine]);

    useEffect(() => {
        apiGet('/api/intel/co-location', { admin: true })
            .then((d) => setCoLocation(d.events || []))
            .catch(() => {});
        apiGet('/api/intel/heatmap', { admin: true })
            .then((d) => setHeatmap(d.heatmap || []))
            .catch(() => {});
    }, []);

    useEffect(() => {
        const socket = getTrackingSocket();
        const onRisk = (payload) => {
            if (payload.case_id === selectedCaseId) {
                setRisk((prev) => ({
                    case_id: payload.case_id,
                    score: payload.score,
                    risk_level: payload.risk_level,
                    updated_at: payload.updated_at,
                    history: payload.history || prev?.history || []
                }));
            }
        };
        const onCoLoc = (evt) => {
            setCoLocation((prev) => [evt, ...prev].slice(0, 20));
        };
        socket.on('risk_score_update', onRisk);
        socket.on('co_location_alert', onCoLoc);
        return () => {
            socket.off('risk_score_update', onRisk);
            socket.off('co_location_alert', onCoLoc);
        };
    }, [selectedCaseId]);

    if (!selectedCaseId) {
        return <p className="intel-panel__hint">Case seçin — kəşfiyyat və analitika</p>;
    }

    return (
        <div className="intel-panel">
            <h2>Kəşfiyyat / Analitika</h2>

            <nav className="intel-panel__subtabs">
                {['risk', 'profile', 'routine', 'rules', 'coloc'].map((t) => (
                    <button
                        key={t}
                        type="button"
                        className={subTab === t ? 'is-active' : ''}
                        onClick={() => setSubTab(t)}
                    >
                        {t === 'risk' && 'Risk'}
                        {t === 'profile' && 'Profil'}
                        {t === 'routine' && 'Rutin zonalar'}
                        {t === 'rules' && 'Qaydalar'}
                        {t === 'coloc' && 'Co-location'}
                    </button>
                ))}
            </nav>

            {subTab === 'risk' && (
                <section>
                    <h3>Canlı risk skoru</h3>
                    <div className="intel-panel__risk-head">
                        <RiskBadge score={risk?.score} riskLevel={risk?.risk_level} />
                        <span className="intel-panel__risk-meta">
                            {risk?.updated_at
                                ? `Yeniləndi: ${new Date(risk.updated_at).toLocaleString('az-AZ')}`
                                : 'Gözlənilir...'}
                        </span>
                    </div>
                    <RiskTrend history={risk?.history || []} />
                </section>
            )}

            {subTab === 'profile' && profile && (
                <section>
                    <h3>Davranış profili</h3>
                    <p>{profile.summary_az}</p>
                    <p>
                        Risk: {profile.risk_level} | Skor: {profile.score} | Rutin: {profile.routine_score}
                    </p>
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
                    <p className="intel-panel__meta">Heatmap: {heatmap.length} isti nöqtə</p>
                </section>
            )}

            {subTab === 'routine' && (
                <section>
                    <h3>Pattern-of-life</h3>
                    <button type="button" className="intel-panel__refresh" onClick={() => loadRoutine(true)}>
                        Zonaları yenilə
                    </button>
                    {routine?.summary_az && <p>{routine.summary_az}</p>}
                    <ul>
                        {(routine?.zones || []).map((z) => (
                            <li key={z.id || z.label}>
                                <strong>{z.label}</strong> — {z.dwell_count} nöqtə, radius {z.radius_m}m
                                <br />
                                <small>
                                    {z.lat?.toFixed(5)}, {z.lon?.toFixed(5)} ({z.type})
                                </small>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {subTab === 'rules' && <AnomalyRulesPanel selectedCaseId={selectedCaseId} />}

            {subTab === 'coloc' && (
                <section>
                    <h3>Co-location / görüş</h3>
                    {coLocation.length === 0 ? (
                        <p>Kəsişmə yoxdur</p>
                    ) : (
                        <ul>
                            {coLocation.slice(0, 15).map((e) => (
                                <li key={e.key || `${e.device_a}-${e.ts}`}>
                                    {e.device_a} ↔ {e.device_b} ({e.distance_m}m)
                                    <br />
                                    <small>{new Date(e.ts).toLocaleString('az-AZ')}</small>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}
        </div>
    );
}

export default IntelPanel;
