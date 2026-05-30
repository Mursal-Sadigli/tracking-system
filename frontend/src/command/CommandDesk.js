import React, { useState, useEffect, useCallback } from 'react';
import MapComponent from '../MapComponent';
import { getTrackingSocket } from '../socketService';
import { apiGet, apiPost } from '../api';
import CaseTimeline from './CaseTimeline';
import LinkGenerator from './LinkGenerator';
import VisitHistory from './VisitHistory';
import ShareLinkButton from './ShareLinkButton';
import SubjectMediaPanel from './SubjectMediaPanel';
import SubjectIntelPanel from './SubjectIntelPanel';
import RiskBadge from '../intel/RiskBadge';
import './CommandDesk.css';

function CommandDesk({
    wallMode = false,
    onCaseSelect,
    routineZones = [],
    onOpenMediaTab,
    onMediaCaptured
}) {
    const [cases, setCases] = useState([]);
    const [riskByCase, setRiskByCase] = useState({});
    const [selected, setSelected] = useState(null);
    const [events, setEvents] = useState([]);
    const [devices, setDevices] = useState([]);
    const [noteText, setNoteText] = useState('');
    const [mlAlert, setMlAlert] = useState(null);
    const [operatorId, setOperatorId] = useState(
        () => localStorage.getItem('operator_id') || 'operator_1'
    );

    const loadCases = useCallback(async () => {
        try {
            const data = await apiGet('/api/cases?status=active', { admin: true });
            setCases(data.cases || []);
            const riskData = await apiGet('/api/intel/risk', { admin: true });
            setRiskByCase(riskData.snapshots || {});
        } catch (e) {
            console.error(e);
        }
    }, []);

    const loadEvents = useCallback(async (caseId) => {
        if (!caseId) return;
        try {
            const data = await apiGet(`/api/cases/${caseId}/events?limit=50`, { admin: true });
            setEvents(data.events || []);
        } catch (e) {
            console.error(e);
        }
    }, []);

    useEffect(() => {
        loadCases();
        const interval = setInterval(loadCases, 15000);
        return () => clearInterval(interval);
    }, [loadCases]);

    useEffect(() => {
        const socket = getTrackingSocket();
        socket.emit('case_subscribe', { all_active: true });

        const onLocation = (data) => {
            setDevices((prev) => {
                const patch = {
                    device_id: data.device_id,
                    lat: data.latitude,
                    lon: data.longitude,
                    speed: data.speed,
                    is_moving: data.is_moving,
                    device_name: data.device_name,
                    case_id: data.case_id,
                    lastUpdate: data.timestamp,
                    accuracy: data.accuracy,
                    location_quality: data.location_quality
                };
                const idx = prev.findIndex((d) => d.device_id === data.device_id);
                if (idx >= 0) {
                    const next = [...prev];
                    next[idx] = { ...next[idx], ...patch };
                    return next;
                }
                return [...prev, patch];
            });
        };

        const onCaseEvent = (ev) => {
            setEvents((prev) => [ev, ...prev].slice(0, 80));
            if (selected?.case_id === ev.case_id) loadEvents(ev.case_id);
        };

        const onAnomaly = (payload) => {
            const primary = payload.anomalies?.[0];
            const explanation =
                payload.ml_explanations?.[0]?.explanation_az ||
                primary?.explanation_az ||
                primary?.type ||
                'Anomaliya';
            setMlAlert({
                case_id: payload.case_id,
                text: explanation,
                model_version: payload.model_version,
                ts: Date.now()
            });
            setEvents((prev) => [
                {
                    id: `evt_anom_${Date.now()}`,
                    type: 'ai_anomaly',
                    case_id: payload.case_id,
                    ts: new Date().toISOString(),
                    payload: { primary, ml_explanations: payload.ml_explanations }
                },
                ...prev
            ].slice(0, 80));
        };

        const onRisk = (payload) => {
            if (!payload.case_id) return;
            setRiskByCase((prev) => ({
                ...prev,
                [payload.case_id]: {
                    score: payload.score,
                    risk_level: payload.risk_level,
                    updated_at: payload.updated_at,
                    history: payload.history
                }
            }));
        };

        const onCoLoc = (evt) => {
            setEvents((prev) => [
                {
                    id: `evt_coloc_${Date.now()}`,
                    type: 'co_location_meeting',
                    case_id: evt.case_a || evt.case_b,
                    ts: evt.ts || new Date().toISOString(),
                    payload: evt
                },
                ...prev
            ].slice(0, 80));
        };

        socket.on('location_update', onLocation);
        socket.on('case_event', onCaseEvent);
        socket.on('ai_anomaly_alert', onAnomaly);
        socket.on('risk_score_update', onRisk);
        socket.on('co_location_alert', onCoLoc);

        const onMedia = (payload) => {
            if (selected?.case_id && payload.case_id === selected.case_id) {
                onMediaCaptured?.();
            }
        };
        socket.on('media_captured', onMedia);

        apiGet('/api/devices')
            .then((list) => {
                const mapped = (list || []).map((d) => ({
                    device_id: d.device_id,
                    lat: d.lat,
                    lon: d.lon,
                    speed: d.speed,
                    device_name: d.device_name,
                    case_id: d.case_id,
                    lastUpdate: d.lastUpdate,
                    accuracy: d.accuracy,
                    location_quality: d.location_quality
                }));
                setDevices(mapped);
            })
            .catch(() => {});

        return () => {
            socket.off('location_update', onLocation);
            socket.off('case_event', onCaseEvent);
            socket.off('ai_anomaly_alert', onAnomaly);
            socket.off('risk_score_update', onRisk);
            socket.off('co_location_alert', onCoLoc);
            socket.off('media_captured', onMedia);
        };
    }, [selected, loadEvents, onMediaCaptured]);

    useEffect(() => {
        if (selected) loadEvents(selected.case_id);
    }, [selected, loadEvents]);

    const selectCase = (c) => {
        setSelected(c);
        onCaseSelect?.(c);
        const dev = devices.find((d) => d.device_id === c.device_id);
        if (dev) setSelected({ ...c, ...dev });
    };

    const addNote = async () => {
        if (!selected || !noteText.trim()) return;
        await apiPost(
            `/api/cases/${selected.case_id}/notes`,
            { author: operatorId, text: noteText },
            { admin: true }
        );
        setNoteText('');
        loadEvents(selected.case_id);
    };

    const handoff = async () => {
        if (!selected) return;
        const next = prompt('Yeni operator ID:', 'operator_2');
        if (!next) return;
        await apiPost(`/api/cases/${selected.case_id}/handoff`, { operator_id: next }, { admin: true });
        localStorage.setItem('operator_id', next);
        setOperatorId(next);
        loadCases();
    };

    const caseDevices = selected
        ? devices.filter((d) => d.case_id === selected.case_id || d.device_id === selected.device_id)
        : devices;

    return (
        <div className={`command-desk${wallMode ? ' command-desk--wall' : ''}`}>
            <aside className="command-desk__sidebar">
                <LinkGenerator onCaseCreated={(c) => { loadCases(); setSelected(c); }} />
                <VisitHistory />
                <div className="command-desk__operator">
                    <label>
                        Operator ID
                        <input
                            value={operatorId}
                            onChange={(e) => {
                                setOperatorId(e.target.value);
                                localStorage.setItem('operator_id', e.target.value);
                            }}
                        />
                    </label>
                </div>
                <h3>Aktiv tapşırıqlar ({cases.length})</h3>
                <ul className="command-desk__cases">
                    {cases.map((c) => (
                        <li key={c.case_id}>
                            <button
                                type="button"
                                className={selected?.case_id === c.case_id ? 'is-active' : ''}
                                onClick={() => selectCase(c)}
                            >
                                <strong>{c.title}</strong>
                                <RiskBadge
                                    score={riskByCase[c.case_id]?.score}
                                    riskLevel={riskByCase[c.case_id]?.risk_level}
                                    compact
                                />
                                <span className={`priority priority--${c.priority}`}>{c.priority}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </aside>

            <main className="command-desk__map">
                <MapComponent
                    devices={caseDevices}
                    selectedDevice={caseDevices[0] || null}
                    userLocation={null}
                    currentDeviceId={null}
                    routineZones={routineZones}
                />
            </main>

            <aside className="command-desk__detail">
                {selected ? (
                    <>
                        <h2>{selected.title}</h2>
                        {mlAlert?.case_id === selected.case_id && (
                            <div className="command-desk__ml-alert" role="status">
                                <strong>ML anomaliya</strong>
                                <p>{mlAlert.text}</p>
                                {mlAlert.model_version && (
                                    <small>Model: {mlAlert.model_version}</small>
                                )}
                                <button type="button" onClick={() => setMlAlert(null)}>
                                    Bağla
                                </button>
                            </div>
                        )}
                        <SubjectIntelPanel
                            caseId={selected.case_id}
                            deviceLat={selected.lat}
                            deviceLon={selected.lon}
                            deviceAccuracy={selected.accuracy}
                        />
                        <p className="command-desk__meta">Cihaz: {selected.device_id}</p>
                        {selected.lat != null && (
                            <p className="command-desk__meta">
                                {selected.lat?.toFixed(5)}, {selected.lon?.toFixed(5)}
                                {selected.accuracy != null && ` ±${Math.round(selected.accuracy)}m`}
                            </p>
                        )}
                        <p className="command-desk__meta">
                            ⚡ Sürət:{' '}
                            <strong>{(selected.speed_kmh ?? (selected.speed || 0) * 3.6).toFixed(1)} km/saat</strong>
                        </p>
                        <p className="command-desk__meta">
                            {selected.network_online === false ? '🔴 İnternet yox' : '🟢 Online'}
                            {selected.network_type && ` • ${selected.network_type}`}
                        </p>
                        {selected.ip && (
                            <p className="command-desk__meta">
                                IP: {selected.ip}
                                {selected.isp && ` • ${selected.isp}`}
                                {selected.org && ` (${selected.org})`}
                            </p>
                        )}
                        <SubjectMediaPanel caseId={selected.case_id} onOpenGallery={onOpenMediaTab} />
                        <ShareLinkButton caseId={selected.case_id} />
                        <button type="button" className="command-desk__handoff" onClick={handoff}>
                            Təhvil ver (handoff)
                        </button>
                        <div className="command-desk__notes">
                            <textarea
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                placeholder="Operator qeydi..."
                                rows={2}
                            />
                            <button type="button" onClick={addNote}>
                                Qeyd əlavə et
                            </button>
                        </div>
                        <h3>Hadisə xətti</h3>
                        <CaseTimeline events={events} />
                    </>
                ) : (
                    <p>Tapşırıq seçin</p>
                )}
            </aside>
        </div>
    );
}

export default CommandDesk;
