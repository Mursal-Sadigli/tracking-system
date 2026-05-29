import React, { useState, useEffect } from 'react';
import { apiGet, apiPut } from '../api';
import './AnomalyRulesPanel.css';

const FIELDS = [
    { key: 'speed_limit_kmh', label: 'Sürət limiti (km/saat)', min: 20, max: 200 },
    { key: 'teleport_distance_m', label: 'Teleport məsafəsi (m)', min: 500, max: 20000 },
    { key: 'teleport_max_seconds', label: 'Teleport max vaxt (san)', min: 30, max: 300 },
    { key: 'accuracy_max_m', label: 'Max GPS dəqiqliyi (m)', min: 50, max: 500 }
];

function AnomalyRulesPanel({ selectedCaseId }) {
    const [globalRules, setGlobalRules] = useState({});
    const [caseRules, setCaseRules] = useState({});
    const [useCase, setUseCase] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        apiGet('/api/anomaly-rules', { admin: true })
            .then((d) => {
                setGlobalRules(d.global || {});
                if (selectedCaseId && d.by_case?.[selectedCaseId]) {
                    setCaseRules(d.by_case[selectedCaseId]);
                    setUseCase(true);
                } else {
                    setCaseRules({});
                    setUseCase(false);
                }
            })
            .catch(() => {});
    }, [selectedCaseId]);

    const active = useCase && selectedCaseId ? caseRules : globalRules;
    const setActive = useCase && selectedCaseId ? setCaseRules : setGlobalRules;

    const save = async () => {
        if (useCase && selectedCaseId) {
            await apiPut('/api/anomaly-rules', { case_id: selectedCaseId, rules: caseRules });
        } else {
            await apiPut('/api/anomaly-rules', { rules: globalRules });
        }
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <section className="anomaly-rules">
            <h3>Anomaliya qaydaları</h3>
            {selectedCaseId && (
                <label className="anomaly-rules__toggle">
                    <input
                        type="checkbox"
                        checked={useCase}
                        onChange={(e) => setUseCase(e.target.checked)}
                    />
                    Yalnız seçilmiş case üçün
                </label>
            )}
            {FIELDS.map((f) => (
                <label key={f.key} className="anomaly-rules__field">
                    {f.label}
                    <input
                        type="number"
                        min={f.min}
                        max={f.max}
                        value={active[f.key] ?? ''}
                        onChange={(e) =>
                            setActive((prev) => ({
                                ...prev,
                                [f.key]: Number(e.target.value)
                            }))
                        }
                    />
                </label>
            ))}
            <button type="button" className="anomaly-rules__save" onClick={save}>
                {saved ? 'Saxlandı ✓' : 'Qaydaları saxla'}
            </button>
        </section>
    );
}

export default AnomalyRulesPanel;
