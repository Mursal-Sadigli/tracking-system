import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Polyline, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { apiDelete, apiGet, apiPost } from '../api';
import { ZONE_TYPE_LIST, zoneTypeMeta } from '../utils/geofenceConstants';
import './GeofencePanel.css';

function MapClickDraw({ drawing, onAddPoint }) {
    useMapEvents({
        click(e) {
            if (!drawing) return;
            onAddPoint(e.latlng.lat, e.latlng.lng);
        }
    });
    return null;
}

export default function GeofencePanel({ caseId, onGeofencesChange }) {
    const [geofences, setGeofences] = useState([]);
    const [zoneName, setZoneName] = useState('Yeni zona');
    const [zoneType, setZoneType] = useState('restricted');
    const [drawing, setDrawing] = useState(false);
    const [draftPoints, setDraftPoints] = useState([]);
    const [loadError, setLoadError] = useState('');
    const [saving, setSaving] = useState(false);

    const loadGeofences = useCallback(async () => {
        if (!caseId) {
            setGeofences([]);
            onGeofencesChange?.([]);
            return;
        }
        try {
            const data = await apiGet(`/api/geofences?case_id=${encodeURIComponent(caseId)}`, {
                admin: true
            });
            const list = data.geofences || [];
            setGeofences(list);
            onGeofencesChange?.(list);
            setLoadError('');
        } catch (e) {
            setLoadError(e?.message || 'Geozonlar yüklənmədi');
        }
    }, [caseId, onGeofencesChange]);

    useEffect(() => {
        loadGeofences();
    }, [loadGeofences]);

    const mapCenter = useMemo(() => {
        if (draftPoints[0]) return draftPoints[0];
        const first = geofences.find((g) => g.polygon?.[0]);
        if (first?.polygon?.[0]) return [first.polygon[0].lat, first.polygon[0].lon];
        return [40.4093, 49.8671];
    }, [draftPoints, geofences]);

    const addPoint = (lat, lon) => {
        setDraftPoints((prev) => [...prev, [lat, lon]]);
    };

    const finishPolygon = async () => {
        if (!caseId || draftPoints.length < 3) return;
        setSaving(true);
        try {
            const polygon = draftPoints.map(([lat, lon]) => ({ lat, lon }));
            const created = await apiPost(
                '/api/geofences',
                { case_id: caseId, name: zoneName, zone_type: zoneType, polygon },
                { admin: true }
            );
            setGeofences((prev) => {
                const next = [...prev, created];
                onGeofencesChange?.(next);
                return next;
            });
            setDraftPoints([]);
            setDrawing(false);
            setZoneName('Yeni zona');
            setLoadError('');
        } catch (e) {
            setLoadError(e?.message || 'Zona yaradılmadı');
        } finally {
            setSaving(false);
        }
    };

    const removeGeofence = async (id) => {
        try {
            await apiDelete(`/api/geofences/${id}`, { admin: true });
            setGeofences((prev) => {
                const next = prev.filter((g) => g.id !== id);
                onGeofencesChange?.(next);
                return next;
            });
        } catch (e) {
            setLoadError(e?.message || 'Silinmədi');
        }
    };

    if (!caseId) {
        return (
            <div className="geofence-panel">
                <h3>Geozonlar</h3>
                <p className="geofence-panel__hint">Tapşırıq seçin</p>
            </div>
        );
    }

    return (
        <div className="geofence-panel">
            <h3>Geozonlar</h3>
            <p className="geofence-panel__hint">
                Əvvəlcədən təyin olunmuş zonlara giriş/çıxış xəbərdarlığı
            </p>

            <div className="geofence-panel__legend">
                {ZONE_TYPE_LIST.map((z) => (
                    <span key={z.id} className={`geofence-panel__legend-item geofence-panel__legend-item--${z.id}`}>
                        {z.emoji} {z.label}
                    </span>
                ))}
            </div>

            <label className="geofence-panel__field">
                Zona adı
                <input value={zoneName} onChange={(e) => setZoneName(e.target.value)} />
            </label>

            <label className="geofence-panel__field">
                Zona tipi
                <select value={zoneType} onChange={(e) => setZoneType(e.target.value)}>
                    {ZONE_TYPE_LIST.map((z) => (
                        <option key={z.id} value={z.id}>
                            {z.emoji} {z.label}
                        </option>
                    ))}
                </select>
            </label>

            <div className="geofence-panel__draw-actions">
                <button
                    type="button"
                    className={drawing ? 'is-active' : ''}
                    onClick={() => setDrawing((v) => !v)}
                >
                    {drawing ? 'Çəkmə dayandır' : 'Xəritədə çək'}
                </button>
                <button
                    type="button"
                    disabled={draftPoints.length < 3 || saving}
                    onClick={finishPolygon}
                >
                    {saving ? 'Saxlanır...' : `Saxla (${draftPoints.length} nöqtə)`}
                </button>
                {draftPoints.length > 0 && (
                    <button type="button" className="geofence-panel__clear" onClick={() => setDraftPoints([])}>
                        Təmizlə
                    </button>
                )}
            </div>

            <div className="geofence-panel__mini-map">
                <MapContainer center={mapCenter} zoom={14} scrollWheelZoom={false}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                    <MapClickDraw drawing={drawing} onAddPoint={addPoint} />
                    {geofences.map((g) => {
                        const meta = zoneTypeMeta(g.zone_type);
                        const positions = (g.polygon || []).map((p) => [p.lat, p.lon]);
                        if (positions.length < 3) return null;
                        return (
                            <Polygon
                                key={g.id}
                                positions={positions}
                                pathOptions={{
                                    color: meta.color,
                                    fillColor: meta.fillColor,
                                    fillOpacity: meta.fillOpacity,
                                    weight: 2
                                }}
                            />
                        );
                    })}
                    {draftPoints.length >= 2 && (
                        <Polyline positions={draftPoints} pathOptions={{ color: '#22d3ee', weight: 2 }} />
                    )}
                    {draftPoints.length >= 3 && (
                        <Polygon
                            positions={draftPoints}
                            pathOptions={{
                                color: '#22d3ee',
                                fillColor: '#22d3ee',
                                fillOpacity: 0.2,
                                dashArray: '6 4'
                            }}
                        />
                    )}
                </MapContainer>
            </div>

            {loadError && <p className="geofence-panel__error">{loadError}</p>}

            <ul className="geofence-panel__list">
                {geofences.length === 0 && (
                    <li className="geofence-panel__empty">Bu tapşırıq üçün geozon yoxdur</li>
                )}
                {geofences.map((g) => {
                    const meta = zoneTypeMeta(g.zone_type);
                    return (
                        <li key={g.id} className={`geofence-panel__item geofence-panel__item--${g.zone_type}`}>
                            <div>
                                <strong>
                                    {meta.emoji} {g.name}
                                </strong>
                                <span>{meta.label}</span>
                            </div>
                            <button type="button" onClick={() => removeGeofence(g.id)}>
                                Sil
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
