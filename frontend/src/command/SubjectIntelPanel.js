import React, { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api';
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

function Row({ label, value }) {
    if (value == null || value === '') return null;
    return (
        <div className="subject-intel__row">
            <span className="subject-intel__label">{label}</span>
            <span className="subject-intel__value">{String(value)}</span>
        </div>
    );
}

function SubjectIntelPanel({ caseId }) {
    const [intel, setIntel] = useState(null);
    const [loading, setLoading] = useState(false);

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

    const snap = intel?.latest?.snapshot;
    if (!caseId) return null;

    return (
        <div className="subject-intel">
            <div className="subject-intel__head">
                <h3>Subyekt profili</h3>
                <button type="button" className="subject-intel__refresh" onClick={load} disabled={loading}>
                    {loading ? '…' : 'Yenilə'}
                </button>
            </div>
            <p className="subject-intel__legal">
                Yalnız texniki və icazəli məlumat. Cookie oğurluğu, keylogger və brauzer tarixçəsi
                daxil deyil.
            </p>

            {!snap ? (
                <p className="subject-intel__empty">Subyekt hələ məlumat göndərməyib (ilk 10 san gözləyin)</p>
            ) : (
                <>
                    <IntelSection title="Şəbəkə (server)">
                        <Row label="IP" value={snap.server?.ip} />
                        <Row label="Şəhər" value={snap.server?.city} />
                        <Row label="Ölkə" value={snap.server?.country} />
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
                        <Row label="User-Agent" value={snap.device?.user_agent} />
                        <Row label="Yaddaş (GB)" value={snap.device?.device_memory_gb} />
                        <Row label="CPU nüvə" value={snap.device?.hardware_concurrency} />
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
                        <Row label="Ölkə (təxmini)" value={snap.locale?.region_guess?.country} />
                        <Row label="Şəhər (təxmini)" value={snap.locale?.region_guess?.city} />
                    </IntelSection>

                    <IntelSection title="Şəbəkə (brauzer)">
                        <Row label="Online" value={snap.network?.online ? 'bəli' : 'xeyr'} />
                        <Row label="Tip" value={snap.network?.effective_type} />
                        <Row label="Downlink" value={snap.network?.downlink_mbps != null ? `${snap.network.downlink_mbps} Mbps` : null} />
                        <Row label="RTT" value={snap.network?.rtt_ms != null ? `${snap.network.rtt_ms} ms` : null} />
                        <Row label="HTTPS kontekst" value={snap.secure_context ? 'bəli' : 'xeyr (GPS zəif ola bilər)'} />
                    </IntelSection>

                    <IntelSection title="İcazə statusu">
                        <Row label="Konum" value={snap.permissions?.geolocation} />
                        <Row label="Kamera" value={snap.permissions?.camera} />
                        <Row label="Mikrofon" value={snap.permissions?.microphone} />
                        <Row label="Bildiriş" value={snap.permissions?.notifications} />
                    </IntelSection>

                    <p className="subject-intel__meta">
                        Son yeniləmə: {snap.collected_at ? new Date(snap.collected_at).toLocaleString('az-AZ') : '—'}
                        {snap.phase ? ` • ${snap.phase}` : ''}
                    </p>
                </>
            )}
        </div>
    );
}

export default SubjectIntelPanel;
