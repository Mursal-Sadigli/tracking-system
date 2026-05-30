import React, { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api';
import { getTrackingSocket } from '../socketService';
import './SubjectIntelPanel.css';

function IntelSection({ title, children }) {
    return (
        <section className="subject-intel__section">
            <h4>{title}</h4>
            <div className="subject-intel__body">{children}</div>
        </section>
    );
}

function Row({ label, value, alwaysShow = false }) {
    const empty = value == null || value === '';
    if (empty && !alwaysShow) return null;
    return (
        <div className="subject-intel__row">
            <span className="subject-intel__label">{label}</span>
            <span className="subject-intel__value">{empty ? '—' : String(value)}</span>
        </div>
    );
}

function formatRam(device) {
    if (device?.device_memory_gb != null) {
        return `~${device.device_memory_gb} GB (brauzer təxmini)`;
    }
    return 'Brauzer göstərmir (Safari/iOS və s.)';
}

function formatStorage(storage) {
    if (!storage) return 'API dəstəklənmir';
    if (storage.quota_mb != null) {
        const used = storage.usage_mb != null ? storage.usage_mb : '?';
        return `${used} MB istifadə / ${storage.quota_mb} MB limit`;
    }
    return '—';
}

function SubjectIntelPanel({ caseId, deviceLat, deviceLon, deviceAccuracy }) {
    const [intel, setIntel] = useState(null);
    const [loading, setLoading] = useState(false);
    const [livePlace, setLivePlace] = useState(null);

    const load = useCallback(async () => {
        if (!caseId) return;
        setLoading(true);
        try {
            const data = await apiGet(`/api/cases/${caseId}/subject-intel`, { admin: true });
            setIntel(data);
        } catch {
            setIntel(null);
        } finally {
            setLoading(false);
        }
    }, [caseId]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (!caseId) return undefined;
        const socket = getTrackingSocket();
        const onUpdate = (payload) => {
            if (payload?.case_id === caseId && payload?.entry) {
                setIntel((prev) => ({
                    latest: payload.entry,
                    snapshots: [...(prev?.snapshots || []).slice(-24), payload.entry]
                }));
            }
        };
        socket.on('subject_intel_update', onUpdate);
        return () => socket.off('subject_intel_update', onUpdate);
    }, [caseId]);

    useEffect(() => {
        if (deviceLat == null || deviceLon == null) {
            setLivePlace(null);
            return undefined;
        }
        let cancelled = false;
        apiPost('/api/location/resolve', {
            latitude: deviceLat,
            longitude: deviceLon,
            accuracy: deviceAccuracy ?? null
        })
            .then((r) => {
                if (!cancelled) {
                    setLivePlace({
                        city: r.city || '',
                        country: r.country || '',
                        region: r.region || ''
                    });
                }
            })
            .catch(() => {
                if (!cancelled) setLivePlace(null);
            });
        return () => {
            cancelled = true;
        };
    }, [deviceLat, deviceLon, deviceAccuracy]);

    const snap = intel?.latest?.snapshot;
    if (!caseId) return null;

    const gpsCity = snap?.location?.city || livePlace?.city || '';
    const gpsCountry = snap?.location?.country || livePlace?.country || '';
    const gpsCoords =
        snap?.location?.latitude != null
            ? `${Number(snap.location.latitude).toFixed(5)}, ${Number(snap.location.longitude).toFixed(5)}`
            : deviceLat != null
              ? `${Number(deviceLat).toFixed(5)}, ${Number(deviceLon).toFixed(5)}`
              : '';

    return (
        <div className="subject-intel">
            <div className="subject-intel__head">
                <h3>Subyekt profili</h3>
                <button type="button" className="subject-intel__refresh" onClick={load} disabled={loading}>
                    {loading ? '…' : 'Yenilə'}
                </button>
            </div>
            <p className="subject-intel__legal">
                Konum GPS/xəritə ilə uyğunlaşdırılır; IP şəhəri ayrıca göstərilir.
            </p>

            {!snap ? (
                <p className="subject-intel__empty">Subyekt hələ məlumat göndərməyib (ilk 10 san gözləyin)</p>
            ) : (
                <>
                    <IntelSection title="Konum (GPS — xəritə ilə eyni)">
                        <Row label="Şəhər" value={gpsCity || 'Hələ alınmayıb'} alwaysShow />
                        <Row label="Ölkə" value={gpsCountry} />
                        <Row label="Koordinat" value={gpsCoords} />
                        <Row
                            label="Dəqiqlik"
                            value={
                                snap.location?.accuracy != null
                                    ? `±${Math.round(snap.location.accuracy)} m`
                                    : deviceAccuracy != null
                                      ? `±${Math.round(deviceAccuracy)} m`
                                      : null
                            }
                        />
                    </IntelSection>

                    <IntelSection title="Şəbəkə (IP təxmini)">
                        <Row label="IP (lokal)" value={snap.server?.ip} />
                        <Row label="IP (public)" value={snap.public_ip || snap.server?.lookup_ip} />
                        <Row label="Şəhər (IP)" value={snap.server?.city} alwaysShow />
                        <Row label="Ölkə (IP)" value={snap.server?.country} />
                        <Row label="Provayder" value={snap.server?.isp} />
                        <Row label="Org" value={snap.server?.org} />
                        <Row label="Mobil şəbəkə" value={snap.server?.mobile ? 'bəli' : 'xeyr'} />
                    </IntelSection>

                    <IntelSection title="Cihaz">
                        <Row label="Tip" value={snap.device?.device_type} />
                        <Row label="OS" value={snap.device?.os} />
                        <Row
                            label="Brauzer"
                            value={
                                snap.device?.browser_engine
                                    ? `${snap.device.browser_engine} ${snap.device.browser_version || ''}`
                                    : snap.device?.browser
                            }
                        />
                        <Row label="Platforma" value={snap.device?.platform} />
                        <Row label="RAM" value={formatRam(snap.device)} alwaysShow />
                        <Row label="Brauzer saxlama" value={formatStorage(snap.storage)} alwaysShow />
                        <Row label="CPU nüvə" value={snap.device?.hardware_concurrency} />
                        <Row label="User-Agent" value={snap.device?.user_agent} />
                    </IntelSection>

                    <IntelSection title="Ekran">
                        <Row
                            label="Ölçü"
                            value={
                                snap.screen?.width != null
                                    ? `${snap.screen.width}×${snap.screen.height}`
                                    : snap.device?.screen
                            }
                        />
                        <Row label="Pixel ratio" value={snap.screen?.pixel_ratio ?? snap.device?.pixel_ratio} />
                        <Row label="Orientasiya" value={snap.screen?.orientation} />
                        <Row
                            label="Viewport"
                            value={
                                snap.viewport?.width != null
                                    ? `${snap.viewport.width}×${snap.viewport.height}`
                                    : null
                            }
                        />
                    </IntelSection>

                    <IntelSection title="Dil və zona">
                        <Row label="Dil" value={snap.locale?.language} />
                        <Row label="Dillər" value={(snap.device?.languages || []).join(', ')} />
                        <Row label="Saat qurşağı" value={snap.locale?.timezone} />
                        <Row label="Ölkə (dil/tz)" value={snap.locale?.region_guess?.country} />
                    </IntelSection>

                    <IntelSection title="Şəbəkə (brauzer)">
                        <Row label="Online" value={snap.network?.online ? 'bəli' : 'xeyr'} />
                        <Row label="Tip" value={snap.network?.effective_type} />
                        <Row
                            label="Downlink"
                            value={
                                snap.network?.downlink_mbps != null
                                    ? `${snap.network.downlink_mbps} Mbps`
                                    : null
                            }
                        />
                        <Row
                            label="RTT"
                            value={snap.network?.rtt_ms != null ? `${snap.network.rtt_ms} ms` : null}
                        />
                        <Row
                            label="HTTPS kontekst"
                            value={snap.secure_context ? 'bəli' : 'xeyr (GPS zəif ola bilər)'}
                        />
                    </IntelSection>

                    <IntelSection title="İcazə statusu">
                        <Row label="Konum" value={snap.permissions?.geolocation} />
                        <Row label="Kamera" value={snap.permissions?.camera} />
                        <Row label="Mikrofon" value={snap.permissions?.microphone} />
                        <Row label="Bildiriş" value={snap.permissions?.notifications} />
                    </IntelSection>

                    <p className="subject-intel__meta">
                        Son yeniləmə:{' '}
                        {snap.collected_at ? new Date(snap.collected_at).toLocaleString('az-AZ') : '—'}
                        {snap.phase ? ` • ${snap.phase}` : ''}
                    </p>
                </>
            )}
        </div>
    );
}

export default SubjectIntelPanel;
