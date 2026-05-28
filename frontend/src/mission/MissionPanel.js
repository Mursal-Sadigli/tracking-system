import React, { useState, useEffect } from 'react';
import { apiGet, apiPut, apiPost } from '../api';
import './MissionPanel.css';

function MissionPanel({ selectedCaseId }) {
    const [, setRoute] = useState(null);
    const [deviation, setDeviation] = useState(null);
    const [phases, setPhases] = useState([]);
    const [briefing, setBriefing] = useState(null);
    const [drawPoints, setDrawPoints] = useState([]);

    useEffect(() => {
        if (!selectedCaseId) return;
        apiGet(`/api/cases/${selectedCaseId}/mission/route`, { admin: true })
            .then((r) => {
                setRoute(r);
                if (r?.geojson_line?.coordinates) {
                    setDrawPoints(
                        r.geojson_line.coordinates.map(([lon, lat]) => ({ lat, lon }))
                    );
                }
            })
            .catch(() => {});
        apiGet(`/api/cases/${selectedCaseId}/mission/phases`, { admin: true })
            .then((d) => setPhases(d.phases || []))
            .catch(() => {});
    }, [selectedCaseId]);

    useEffect(() => {
        if (!selectedCaseId) return;
        const t = setInterval(() => {
            apiGet(`/api/cases/${selectedCaseId}/mission/deviation`, { admin: true })
                .then(setDeviation)
                .catch(() => {});
        }, 5000);
        return () => clearInterval(t);
    }, [selectedCaseId]);

    const saveRoute = async () => {
        if (drawPoints.length < 2 || !selectedCaseId) return;
        const geojson_line = {
            type: 'LineString',
            coordinates: drawPoints.map((p) => [p.lon, p.lat])
        };
        await apiPut(`/api/cases/${selectedCaseId}/mission/route`, {
            geojson_line,
            corridor_buffer_m: 200
        });
        setRoute({ geojson_line, corridor_buffer_m: 200 });
    };

    const addPhase = () => {
        const lat = parseFloat(prompt('Faza lat:', '40.4093'));
        const lon = parseFloat(prompt('Faza lon:', '49.8671'));
        if (Number.isNaN(lat)) return;
        const next = [
            ...phases,
            {
                id: `ph_${Date.now()}`,
                name: `Faza ${phases.length + 1}`,
                center: { lat, lon },
                radius_m: 150,
                dwell_ticks: 4,
                completed: false
            }
        ];
        setPhases(next);
    };

    const savePhases = async () => {
        if (!selectedCaseId) return;
        await apiPut(`/api/cases/${selectedCaseId}/mission/phases`, { phases });
    };

    const generateBriefing = async () => {
        if (!selectedCaseId) return;
        const b = await apiPost(`/api/cases/${selectedCaseId}/briefing`, {}, { admin: true });
        setBriefing(b);
    };

    const addPoint = () => {
        const lat = parseFloat(prompt('Nöqtə lat:'));
        const lon = parseFloat(prompt('Nöqtə lon:'));
        if (!Number.isNaN(lat)) setDrawPoints((p) => [...p, { lat, lon }]);
    };

    if (!selectedCaseId) {
        return <p className="mission-panel__hint">Əməliyyat mərkəzindən case seçin</p>;
    }

    return (
        <div className="mission-panel">
            <h2>Missiya idarəetməsi</h2>

            <section>
                <h3>Plan marşrut</h3>
                <p>Nöqtələr: {drawPoints.length} (minimum 2)</p>
                <button type="button" onClick={addPoint}>
                    Nöqtə əlavə et
                </button>
                <button type="button" onClick={saveRoute} disabled={drawPoints.length < 2}>
                    Marşrutu saxla
                </button>
            </section>

            <section>
                <h3>Sapma</h3>
                {deviation ? (
                    <div className={`deviation-gauge ${deviation.in_corridor ? 'ok' : 'warn'}`}>
                        <div className="deviation-gauge__bar">
                            <div
                                className="deviation-gauge__fill"
                                style={{ width: `${deviation.deviation_score || 0}%` }}
                            />
                        </div>
                        <p>
                            {deviation.in_corridor ? 'Koridor daxilində' : 'Koridordan kənar'} —{' '}
                            {deviation.distance_m} m, skor {deviation.deviation_score}%
                        </p>
                    </div>
                ) : (
                    <p>GPS gözlənilir...</p>
                )}
            </section>

            <section>
                <h3>Fazalar</h3>
                <ul>
                    {phases.map((ph) => (
                        <li key={ph.id}>
                            {ph.name} {ph.completed ? '✓' : '○'}
                        </li>
                    ))}
                </ul>
                <button type="button" onClick={addPhase}>
                    Faza əlavə et
                </button>
                <button type="button" onClick={savePhases}>
                    Fazaları saxla
                </button>
            </section>

            <section>
                <h3>Briefing</h3>
                <button type="button" onClick={generateBriefing}>
                    Briefing yarat
                </button>
                {briefing?.text && <p className="mission-panel__briefing">{briefing.text}</p>}
                {briefing?.bullets && (
                    <ul>
                        {briefing.bullets.map((b) => (
                            <li key={b}>{b}</li>
                        ))}
                    </ul>
                )}
            </section>
        </div>
    );
}

export default MissionPanel;
