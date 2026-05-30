import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, Polyline, Circle, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { apiGet, apiPost, apiDelete } from '../api';
import { getTrackingSocket } from '../socketService';
import './ZoneWatchPage.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
    iconUrl: require('leaflet/dist/images/marker-icon.png'),
    shadowUrl: require('leaflet/dist/images/marker-shadow.png')
});

const DEFAULT_CENTER = [40.4093, 49.8671];

const subjectIcon = new L.DivIcon({
    className: 'zone-marker-subject',
    html: '<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid #fff"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7]
});

function MapClickDraw({ drawing, onAddPoint }) {
    useMapEvents({
        click(e) {
            if (!drawing) return;
            onAddPoint(e.latlng.lat, e.latlng.lng);
        }
    });
    return null;
}

function ZoneWatchPage() {
    const [zones, setZones] = useState([]);
    const [selectedId, setSelectedId] = useState(null);
    const [snapshot, setSnapshot] = useState(null);
    const [drawing, setDrawing] = useState(false);
    const [draftPoints, setDraftPoints] = useState([]);
    const [zoneName, setZoneName] = useState('Yeni zona');
    const [loadError, setLoadError] = useState('');

    const loadZones = useCallback(async () => {
        try {
            const data = await apiGet('/api/watch-zones', { admin: true });
            setZones(data.zones || []);
            setLoadError('');
        } catch (e) {
            setLoadError(e?.message || 'Zonalar yüklənmədi');
        }
    }, []);

    const loadSnapshot = useCallback(async (zoneId) => {
        if (!zoneId) return;
        try {
            const data = await apiGet(`/api/watch-zones/${zoneId}/snapshot`, { admin: true });
            setSnapshot(data);
        } catch (e) {
            console.warn(e);
        }
    }, []);

    useEffect(() => {
        loadZones();
    }, [loadZones]);

    useEffect(() => {
        if (selectedId) loadSnapshot(selectedId);
    }, [selectedId, loadSnapshot]);

    useEffect(() => {
        const socket = getTrackingSocket();
        const onZone = (payload) => {
            if (payload.zone_id === selectedId) setSnapshot(payload);
        };
        const onPresence = (payload) => {
            if (payload.zone_id !== selectedId) return;
            setSnapshot((prev) =>
                prev
                    ? { ...prev, subjects: payload.subjects || prev.subjects }
                    : { zone_id: payload.zone_id, subjects: payload.subjects }
            );
        };
        socket.on('area_zone_update', onZone);
        socket.on('watch_zone_presence', onPresence);
        return () => {
            socket.off('area_zone_update', onZone);
            socket.off('watch_zone_presence', onPresence);
        };
    }, [selectedId]);

    const selectedZone = zones.find((z) => z.id === selectedId);

    const finishPolygon = async () => {
        if (draftPoints.length < 3) return;
        const polygon = draftPoints.map((p) => ({ lat: p[0], lon: p[1] }));
        try {
            const created = await apiPost(
                '/api/watch-zones',
                { name: zoneName, polygon, enabled: true },
                { admin: true }
            );
            setZones((z) => [...z, created]);
            setSelectedId(created.id);
            setDraftPoints([]);
            setDrawing(false);
        } catch (e) {
            setLoadError(e?.message || 'Zona yaradılmadı');
        }
    };

    const removeZone = async (id) => {
        try {
            await apiDelete(`/api/watch-zones/${id}`, { admin: true });
            setZones((z) => z.filter((x) => x.id !== id));
            if (selectedId === id) {
                setSelectedId(null);
                setSnapshot(null);
            }
        } catch (e) {
            setLoadError(e?.message || 'Silinmədi');
        }
    };

    const mapCenter = useMemo(() => {
        if (selectedZone?.polygon?.[0]) {
            return [selectedZone.polygon[0].lat, selectedZone.polygon[0].lon];
        }
        if (draftPoints[0]) return draftPoints[0];
        return DEFAULT_CENTER;
    }, [selectedZone, draftPoints]);

    const trafficPolylines = snapshot?.traffic_segments || [];
    const footPoints = snapshot?.foot_points || [];
    const subjects = snapshot?.subjects || [];
    const external = snapshot?.external_devices || [];

    return (
        <div className="zone-watch">
            <aside className="zone-watch__sidebar">
                <h2>Ərazi izləmə</h2>
                <p className="zone-watch__legal">
                    Real məlumat: icazəli subyekt GPS, trafik API (yol sıxlığı), foot-traffic
                    (anonim kütlə). Fərdi telefon izləməsi vəd edilmir. Simulyasiya istifadə
                    olunmur.
                </p>
                <div className="zone-watch__legend">
                    <span className="subj">Subyekt</span>
                    <span className="traffic">Trafik</span>
                    <span className="foot">Foot-traffic</span>
                    <span className="ext">Xarici API</span>
                </div>
                {loadError && <p style={{ color: '#f87171', fontSize: '0.8rem' }}>{loadError}</p>}
                <div className="zone-watch__actions">
                    <button
                        type="button"
                        className={drawing ? 'is-primary' : ''}
                        onClick={() => {
                            setDrawing(!drawing);
                            if (!drawing) setDraftPoints([]);
                        }}
                    >
                        {drawing ? 'Çəkmə aktiv' : 'Zona çək'}
                    </button>
                    <button
                        type="button"
                        className="is-primary"
                        disabled={draftPoints.length < 3}
                        onClick={finishPolygon}
                    >
                        Saxla ({draftPoints.length} nöqtə)
                    </button>
                    <button type="button" onClick={() => selectedId && loadSnapshot(selectedId)}>
                        Yenilə
                    </button>
                </div>
                {drawing && (
                    <input
                        type="text"
                        value={zoneName}
                        onChange={(e) => setZoneName(e.target.value)}
                        placeholder="Zona adı"
                        style={{
                            width: '100%',
                            marginBottom: '0.5rem',
                            padding: '0.4rem',
                            borderRadius: 6,
                            border: '1px solid #475569',
                            background: '#0f172a',
                            color: '#fff'
                        }}
                    />
                )}
                <ul className="zone-watch__list">
                    {zones.map((z) => (
                        <li key={z.id}>
                            <button
                                type="button"
                                className={selectedId === z.id ? 'is-active' : ''}
                                onClick={() => setSelectedId(z.id)}
                            >
                                <strong>{z.name}</strong>
                                <div className="zone-watch__counts">
                                    {z.enabled === false ? 'Deaktiv' : 'Aktiv'}
                                </div>
                            </button>
                        </li>
                    ))}
                </ul>
                {selectedId && (
                    <button
                        type="button"
                        style={{ color: '#f87171', background: 'transparent', border: 'none' }}
                        onClick={() => removeZone(selectedId)}
                    >
                        Seçilmiş zonanı sil
                    </button>
                )}
                {snapshot?.briefing?.text && (
                    <div className="zone-watch__briefing">
                        <strong>AI xülasə</strong>
                        <p>{snapshot.briefing.text}</p>
                    </div>
                )}
                {snapshot && (
                    <p className="zone-watch__counts">
                        Subyekt: {subjects.length} • Trafik: {trafficPolylines.length} • Foot:{' '}
                        {footPoints.length} • Xarici: {external.length}
                    </p>
                )}
                {snapshot?.providers && (
                    <p className="zone-watch__counts">
                        Trafik API:{' '}
                        {snapshot.providers.traffic?.configured ? 'bəli' : 'yox (açar lazım)'}
                        {' • '}
                        Foot API:{' '}
                        {snapshot.providers.foot_traffic?.configured ? 'bəli' : 'yox (açar lazım)'}
                    </p>
                )}
            </aside>
            <div className="zone-watch__map-wrap">
                {drawing && (
                    <p className="zone-watch__hint">
                        Xəritəyə klikləyin — polygon üçün ən azı 3 nöqtə, sonra «Saxla».
                    </p>
                )}
                <MapContainer
                    center={mapCenter}
                    zoom={13}
                    className="zone-watch__map"
                    scrollWheelZoom
                >
                    <TileLayer
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        attribution="&copy; OpenStreetMap"
                    />
                    <MapClickDraw
                        drawing={drawing}
                        onAddPoint={(lat, lon) =>
                            setDraftPoints((p) => [...p, [lat, lon]])
                        }
                    />
                    {draftPoints.length >= 2 && (
                        <Polygon
                            positions={draftPoints}
                            pathOptions={{ color: '#38bdf8', fillOpacity: 0.15 }}
                        />
                    )}
                    {zones.map((z) =>
                        z.polygon?.length >= 3 ? (
                            <Polygon
                                key={z.id}
                                positions={z.polygon.map((p) => [p.lat, p.lon])}
                                pathOptions={{
                                    color: selectedId === z.id ? '#2563eb' : '#64748b',
                                    fillColor: '#3b82f6',
                                    fillOpacity: selectedId === z.id ? 0.2 : 0.08,
                                    weight: selectedId === z.id ? 3 : 1
                                }}
                            />
                        ) : null
                    )}
                    {subjects.map((s) => (
                        <Marker
                            key={s.device_id || s.id}
                            position={[s.lat, s.lon]}
                            icon={subjectIcon}
                        >
                            <Popup>
                                Subyekt: {s.label}
                                {s.case_id && ` (${s.case_id})`}
                            </Popup>
                        </Marker>
                    ))}
                    {footPoints.map((p) => (
                        <Circle
                            key={p.id}
                            center={[p.lat, p.lon]}
                            radius={40}
                            pathOptions={{ color: '#f97316', fillOpacity: 0.35 }}
                        >
                            <Popup>Foot-traffic (anonim): {p.label}</Popup>
                        </Circle>
                    ))}
                    {external.map((p) => (
                        <Marker key={p.id} position={[p.lat, p.lon]}>
                            <Popup>Xarici: {p.label}</Popup>
                        </Marker>
                    ))}
                    {trafficPolylines.map((seg) =>
                        seg.coordinates?.length >= 2 ? (
                            <Polyline
                                key={seg.id}
                                positions={seg.coordinates}
                                pathOptions={{
                                    color:
                                        (seg.jam_factor || 0) > 5
                                            ? '#ef4444'
                                            : (seg.jam_factor || 0) > 2
                                              ? '#eab308'
                                              : '#22c55e',
                                    weight: 4,
                                    opacity: 0.8
                                }}
                            />
                        ) : null
                    )}
                </MapContainer>
            </div>
        </div>
    );
}

export default ZoneWatchPage;
