import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, getMediaObjectUrl } from '../api';
import { getTrackingSocket } from '../socketService';
import './MediaGalleryPage.css';

function MediaGalleryPage({ selectedCaseId, onNewMedia }) {
    const [items, setItems] = useState([]);
    const [selected, setSelected] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [loading, setLoading] = useState(false);

    const loadMedia = useCallback(async () => {
        setLoading(true);
        try {
            const path = selectedCaseId
                ? `/api/cases/${selectedCaseId}/media?limit=80`
                : '/api/media/recent?limit=80';
            const data = await apiGet(path, { admin: true });
            const list = data.media || [];
            setItems(list);
            setSelected((prev) => prev || list[0] || null);
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [selectedCaseId]);

    useEffect(() => {
        loadMedia();
    }, [loadMedia]);

    useEffect(() => {
        const socket = getTrackingSocket();
        const onMedia = (payload) => {
            if (selectedCaseId && payload.case_id !== selectedCaseId) return;
            setItems((prev) => {
                const exists = prev.some((p) => p.id === payload.media_id);
                if (exists) return prev;
                return [
                    {
                        id: payload.media_id,
                        case_id: payload.case_id,
                        case_title: payload.case_title,
                        type: payload.type,
                        captured_at: payload.captured_at,
                        mime: payload.mime
                    },
                    ...prev
                ];
            });
            onNewMedia?.();
        };
        socket.on('media_captured', onMedia);
        return () => socket.off('media_captured', onMedia);
    }, [selectedCaseId, onNewMedia]);

    useEffect(() => {
        let revoked = null;
        if (!selected?.id) {
            setPreviewUrl(null);
            return undefined;
        }
        getMediaObjectUrl(selected.id)
            .then((url) => {
                revoked = url;
                setPreviewUrl(url);
            })
            .catch(() => setPreviewUrl(null));
        return () => {
            if (revoked) URL.revokeObjectURL(revoked);
        };
    }, [selected?.id, selected?.type]);

    const filtered = selectedCaseId
        ? items.filter((i) => i.case_id === selectedCaseId)
        : items;

    return (
        <div className="media-gallery">
            <aside className="media-gallery__list">
                <h2>Subyekt media</h2>
                {loading && <p className="media-gallery__hint">Yüklənir...</p>}
                {!loading && filtered.length === 0 && (
                    <p className="media-gallery__hint">Hələ media yoxdur</p>
                )}
                <ul>
                    {filtered.map((item) => (
                        <li key={item.id}>
                            <button
                                type="button"
                                className={selected?.id === item.id ? 'is-active' : ''}
                                onClick={() => setSelected(item)}
                            >
                                <span className={`media-gallery__type media-gallery__type--${item.type}`}>
                                    {item.type === 'photo' ? 'Foto' : 'Video'}
                                </span>
                                <strong>{item.case_title || item.case_id}</strong>
                                <small>{new Date(item.captured_at).toLocaleString('az-AZ')}</small>
                            </button>
                        </li>
                    ))}
                </ul>
            </aside>
            <main className="media-gallery__preview">
                {selected ? (
                    <>
                        <p className="media-gallery__meta">
                            {selected.case_title} — {selected.type} —{' '}
                            {new Date(selected.captured_at).toLocaleString('az-AZ')}
                        </p>
                        {selected.type === 'photo' && previewUrl && (
                            <img src={previewUrl} alt="Subyekt foto" className="media-gallery__img" />
                        )}
                        {selected.type === 'video' && previewUrl && (
                            <video src={previewUrl} controls className="media-gallery__video" />
                        )}
                        {!previewUrl && <p className="media-gallery__hint">Önizləmə yüklənir...</p>}
                    </>
                ) : (
                    <p className="media-gallery__hint">Soldan media seçin</p>
                )}
            </main>
        </div>
    );
}

export default MediaGalleryPage;
