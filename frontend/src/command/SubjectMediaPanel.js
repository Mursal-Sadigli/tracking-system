import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, getMediaObjectUrl } from '../api';
import { getTrackingSocket } from '../socketService';
import './SubjectMediaPanel.css';

function SubjectMediaPanel({ caseId, onOpenGallery }) {
    const [latest, setLatest] = useState({ photo: null, video: null, audio: null });
    const [thumbUrl, setThumbUrl] = useState(null);

    const load = useCallback(async () => {
        if (!caseId) return;
        try {
            const data = await apiGet(`/api/cases/${caseId}/media?limit=20`, { admin: true });
            const list = data.media || [];
            const photo = list.find(
                (m) => m.type === 'photo' && m.capture_source !== 'periodic'
            );
            const video = list.find((m) => m.type === 'video');
            const audio = list.find((m) => m.type === 'audio');
            setLatest({ photo, video, audio });
        } catch {
            setLatest({ photo: null, video: null, audio: null });
        }
    }, [caseId]);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        const socket = getTrackingSocket();
        const onMedia = (p) => {
            if (p.case_id === caseId) load();
        };
        socket.on('media_captured', onMedia);
        return () => socket.off('media_captured', onMedia);
    }, [caseId, load]);

    useEffect(() => {
        let url = null;
        if (!latest.photo?.id) {
            setThumbUrl(null);
            return undefined;
        }
        getMediaObjectUrl(latest.photo.id)
            .then((u) => {
                url = u;
                setThumbUrl(u);
            })
            .catch(() => setThumbUrl(null));
        return () => {
            if (url) URL.revokeObjectURL(url);
        };
    }, [latest.photo?.id]);

    if (!caseId) return null;

    return (
        <section className="subject-media-panel">
            <h3>Son kamera</h3>
            {!latest.photo && !latest.video && !latest.audio ? (
                <p className="subject-media-panel__empty">Media hələ yoxdur</p>
            ) : (
                <>
                    {thumbUrl && (
                        <img src={thumbUrl} alt="" className="subject-media-panel__thumb" />
                    )}
                    <p className="subject-media-panel__meta">
                        {latest.photo &&
                            `Foto: ${new Date(latest.photo.captured_at).toLocaleString('az-AZ')}`}
                        {latest.photo && latest.video && ' • '}
                        {latest.video &&
                            `Video: ${new Date(latest.video.captured_at).toLocaleString('az-AZ')}`}
                        {(latest.photo || latest.video) && latest.audio && ' • '}
                        {latest.audio &&
                            `Son səs: ${new Date(latest.audio.captured_at).toLocaleString('az-AZ')}`}
                    </p>
                </>
            )}
            {onOpenGallery && (
                <button type="button" className="subject-media-panel__link" onClick={onOpenGallery}>
                    Tam bax (Kamera tab)
                </button>
            )}
        </section>
    );
}

export default SubjectMediaPanel;
