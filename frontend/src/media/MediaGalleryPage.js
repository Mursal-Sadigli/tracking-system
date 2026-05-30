import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiGet, apiPost, apiDelete, getMediaObjectUrl } from '../api';
import { getTrackingSocket } from '../socketService';
import './MediaGalleryPage.css';

const SECTIONS = [
    { id: 'av', label: 'Foto & Video' },
    { id: 'audio', label: 'Səs yazıları' },
    { id: 'periodic', label: 'Saatlıq kadrlar' }
];

const BULK_DELETE_CATEGORIES = [
    { id: 'photo', label: 'Fotolar' },
    { id: 'video', label: 'Videolar' },
    { id: 'audio', label: 'Səs yazıları' },
    { id: 'periodic', label: 'Saatlıq kadrlar' }
];

function matchesCategory(item, categoryId) {
    if (categoryId === 'audio') return item.type === 'audio';
    if (categoryId === 'periodic') {
        return item.type === 'photo' && item.capture_source === 'periodic';
    }
    if (categoryId === 'photo') {
        return item.type === 'photo' && item.capture_source !== 'periodic';
    }
    if (categoryId === 'video') return item.type === 'video';
    return false;
}

function itemsForCategory(items, categoryId) {
    return items.filter((i) => matchesCategory(i, categoryId));
}

function filterBySection(items, sectionId) {
    if (sectionId === 'audio') {
        return items.filter((i) => i.type === 'audio');
    }
    if (sectionId === 'periodic') {
        return items.filter((i) => i.type === 'photo' && i.capture_source === 'periodic');
    }
    return items.filter(
        (i) =>
            (i.type === 'photo' || i.type === 'video') &&
            i.capture_source !== 'periodic'
    );
}

function typeLabel(item) {
    if (item.type === 'audio') return 'Səs';
    if (item.type === 'video') return 'Video';
    if (item.capture_source === 'periodic') return 'Saatlıq kadr';
    return 'Foto';
}

const TYPE_FILTER_OPTIONS = [
    { value: 'all', label: 'Hamısı (cari bölmə)' },
    { value: 'photo', label: 'Yalnız foto' },
    { value: 'video', label: 'Yalnız video' },
    { value: 'audio', label: 'Yalnız səs' },
    { value: 'periodic', label: 'Yalnız saatlıq kadr' }
];

function MediaGalleryPage({ selectedCaseId, onNewMedia }) {
    const [items, setItems] = useState([]);
    const [section, setSection] = useState('av');
    const [selected, setSelected] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [selectMode, setSelectMode] = useState(false);
    const [checkedIds, setCheckedIds] = useState(new Set());
    const [typeFilter, setTypeFilter] = useState('all');
    const [deleting, setDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [bulkDeletingCategory, setBulkDeletingCategory] = useState(null);

    const loadMedia = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const path = selectedCaseId
                ? `/api/cases/${selectedCaseId}/media?limit=500`
                : '/api/media/recent?limit=120';
            const data = await apiGet(path, { admin: true });
            const list = data.media || [];
            setItems(list);
        } catch (e) {
            setItems([]);
            setLoadError(e?.message || 'Media yüklənmədi — PIN ilə daxil oldunuzmu?');
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
                        capture_source: payload.capture_source || 'initial',
                        chunk_index: payload.chunk_index,
                        captured_at: payload.captured_at,
                        mime: payload.mime
                    },
                    ...prev
                ];
            });
            onNewMedia?.();
        };
        const onDeleted = (payload) => {
            const ids = payload?.ids || [];
            if (!ids.length) return;
            setItems((prev) => prev.filter((p) => !ids.includes(p.id)));
            setCheckedIds((prev) => {
                const next = new Set(prev);
                ids.forEach((id) => next.delete(id));
                return next;
            });
            setSelected((prev) => (prev && ids.includes(prev.id) ? null : prev));
        };
        socket.on('media_captured', onMedia);
        socket.on('media_deleted', onDeleted);
        return () => {
            socket.off('media_captured', onMedia);
            socket.off('media_deleted', onDeleted);
        };
    }, [selectedCaseId, onNewMedia]);

    const caseItems = useMemo(() => {
        if (!selectedCaseId) return items;
        return items.filter((i) => i.case_id === selectedCaseId);
    }, [items, selectedCaseId]);

    const categoryCounts = useMemo(() => {
        const out = {};
        for (const cat of BULK_DELETE_CATEGORIES) {
            out[cat.id] = itemsForCategory(caseItems, cat.id).length;
        }
        return out;
    }, [caseItems]);

    const applyDeletedIds = useCallback((ids) => {
        if (!ids?.length) return;
        const idSet = new Set(ids);
        setItems((prev) => prev.filter((p) => !idSet.has(p.id)));
        setCheckedIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
        });
        setSelected((prev) => (prev && idSet.has(prev.id) ? null : prev));
        if (ids.some((id) => selected?.id === id)) {
            setPreviewUrl(null);
        }
    }, [selected?.id]);

    const filteredAll = useMemo(() => filterBySection(caseItems, section), [caseItems, section]);

    useEffect(() => {
        setSelected((prev) => {
            if (prev && filteredAll.some((i) => i.id === prev.id)) return prev;
            return filteredAll[0] || null;
        });
    }, [filteredAll, section]);

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

    const idsMatchingTypeFilter = useMemo(() => {
        if (typeFilter === 'all') return filteredAll.map((i) => i.id);
        if (typeFilter === 'periodic') {
            return filteredAll
                .filter((i) => i.type === 'photo' && i.capture_source === 'periodic')
                .map((i) => i.id);
        }
        return filteredAll.filter((i) => i.type === typeFilter).map((i) => i.id);
    }, [filteredAll, typeFilter]);

    const toggleCheck = (id) => {
        setCheckedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const selectByFilter = () => {
        setCheckedIds(new Set(idsMatchingTypeFilter));
    };

    const clearSelection = () => setCheckedIds(new Set());

    const deleteSelected = async () => {
        const ids = [...checkedIds];
        if (!ids.length) return;
        const labels = filteredAll
            .filter((i) => ids.includes(i.id))
            .map((i) => typeLabel(i))
            .slice(0, 5)
            .join(', ');
        const msg =
            ids.length === 1
                ? `Bu media silinsin? (${labels || 'media'})`
                : `${ids.length} media silinsin? (${labels}${ids.length > 5 ? '…' : ''})`;
        if (!window.confirm(msg)) return;

        setDeleting(true);
        setDeleteError('');
        try {
            await apiPost('/api/media/delete-batch', { ids }, { admin: true });
            applyDeletedIds(ids);
            setCheckedIds(new Set());
        } catch (e) {
            setDeleteError(e?.message || 'Silinmədi');
        } finally {
            setDeleting(false);
        }
    };

    const deleteAllCategory = async (categoryId) => {
        const cat = BULK_DELETE_CATEGORIES.find((c) => c.id === categoryId);
        const count = categoryCounts[categoryId] || 0;
        if (!count || !cat) return;

        const scope = selectedCaseId
            ? 'seçilmiş tapşırıq üzrə'
            : 'siyahıda görünən';
        if (
            !window.confirm(
                `${cat.label} — ${count} fayl silinsin? (${scope}, geri qaytarıla bilməz)`
            )
        ) {
            return;
        }

        setBulkDeletingCategory(categoryId);
        setDeleteError('');
        try {
            if (selectedCaseId) {
                const data = await apiPost(
                    '/api/media/delete-by-category',
                    { case_id: selectedCaseId, category: categoryId },
                    { admin: true }
                );
                applyDeletedIds(data.ids || []);
            } else {
                const ids = itemsForCategory(caseItems, categoryId).map((i) => i.id);
                await apiPost('/api/media/delete-batch', { ids }, { admin: true });
                applyDeletedIds(ids);
            }
            setCheckedIds(new Set());
        } catch (e) {
            setDeleteError(e?.message || 'Silinmədi');
        } finally {
            setBulkDeletingCategory(null);
        }
    };

    const deleteCurrent = async () => {
        if (!selected?.id) return;
        if (!window.confirm(`${typeLabel(selected)} silinsin?`)) return;
        setDeleting(true);
        setDeleteError('');
        try {
            await apiDelete(`/api/media/${selected.id}`, { admin: true });
            setItems((prev) => prev.filter((p) => p.id !== selected.id));
            setCheckedIds((prev) => {
                const next = new Set(prev);
                next.delete(selected.id);
                return next;
            });
            setSelected(null);
            setPreviewUrl(null);
        } catch (e) {
            setDeleteError(e?.message || 'Silinmədi');
        } finally {
            setDeleting(false);
        }
    };

    const counts = useMemo(() => {
        return {
            av: filterBySection(caseItems, 'av').length,
            audio: filterBySection(caseItems, 'audio').length,
            periodic: filterBySection(caseItems, 'periodic').length
        };
    }, [caseItems]);

    return (
        <div className="media-gallery">
            <aside className="media-gallery__list">
                <h2>Subyekt media</h2>
                <nav className="media-gallery__sections">
                    {SECTIONS.map((s) => (
                        <button
                            key={s.id}
                            type="button"
                            className={section === s.id ? 'is-active' : ''}
                            onClick={() => setSection(s.id)}
                        >
                            {s.label}
                            <span className="media-gallery__count">{counts[s.id]}</span>
                        </button>
                    ))}
                </nav>
                <div className="media-gallery__bulk-delete">
                    <p className="media-gallery__bulk-title">Hamısını sil</p>
                    {!selectedCaseId && (
                        <p className="media-gallery__bulk-hint">
                            Tapşırıq seçin — bütün media silinəcək (120 limit deyil).
                        </p>
                    )}
                    <div className="media-gallery__bulk-grid">
                        {BULK_DELETE_CATEGORIES.map((cat) => {
                            const n = categoryCounts[cat.id] || 0;
                            const busy = bulkDeletingCategory === cat.id;
                            return (
                                <button
                                    key={cat.id}
                                    type="button"
                                    className="media-gallery__bulk-btn"
                                    disabled={n === 0 || deleting || Boolean(bulkDeletingCategory)}
                                    onClick={() => deleteAllCategory(cat.id)}
                                >
                                    {busy ? 'Silinir…' : `${cat.label} (${n})`}
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="media-gallery__toolbar">
                    <button
                        type="button"
                        className={selectMode ? 'is-active' : ''}
                        onClick={() => {
                            setSelectMode((m) => !m);
                            if (selectMode) clearSelection();
                        }}
                    >
                        {selectMode ? 'Seçimi bağla' : 'Seç və sil'}
                    </button>
                </div>
                {selectMode && (
                    <div className="media-gallery__select-bar">
                        <label className="media-gallery__select-label">
                            Tip üzrə seç:
                            <select
                                value={typeFilter}
                                onChange={(e) => setTypeFilter(e.target.value)}
                            >
                                {TYPE_FILTER_OPTIONS.map((o) => (
                                    <option key={o.value} value={o.value}>
                                        {o.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button type="button" onClick={selectByFilter}>
                            Filtrə uyğun seç ({idsMatchingTypeFilter.length})
                        </button>
                        <button type="button" onClick={clearSelection}>
                            Seçimi təmizlə
                        </button>
                        <button
                            type="button"
                            className="media-gallery__delete-btn"
                            disabled={checkedIds.size === 0 || deleting}
                            onClick={deleteSelected}
                        >
                            {deleting ? 'Silinir...' : `Sil (${checkedIds.size})`}
                        </button>
                    </div>
                )}
                {deleteError && <p className="media-gallery__error">{deleteError}</p>}
                {loading && <p className="media-gallery__hint">Yüklənir...</p>}
                {loadError && <p className="media-gallery__error">{loadError}</p>}
                {!loading && !loadError && filteredAll.length === 0 && (
                    <p className="media-gallery__hint">
                        Bu bölmədə media yoxdur. Subyekt saytda olduqda səs və saatlıq kadrlar
                        avtomatik yüklənir.
                    </p>
                )}
                <ul>
                    {filteredAll.map((item) => (
                        <li key={item.id} className="media-gallery__row">
                            {selectMode && (
                                <input
                                    type="checkbox"
                                    className="media-gallery__check"
                                    checked={checkedIds.has(item.id)}
                                    onChange={() => toggleCheck(item.id)}
                                    aria-label={`Seç: ${typeLabel(item)}`}
                                />
                            )}
                            <button
                                type="button"
                                className={selected?.id === item.id ? 'is-active' : ''}
                                onClick={() => setSelected(item)}
                            >
                                <span
                                    className={`media-gallery__type media-gallery__type--${item.type}`}
                                >
                                    {typeLabel(item)}
                                </span>
                                <strong>{item.case_title || item.case_id}</strong>
                                <small>
                                    {new Date(item.captured_at).toLocaleString('az-AZ')}
                                    {item.chunk_index != null ? ` • #${item.chunk_index}` : ''}
                                </small>
                            </button>
                        </li>
                    ))}
                </ul>
            </aside>
            <main className="media-gallery__preview">
                {selected ? (
                    <>
                        <div className="media-gallery__preview-actions">
                            <p className="media-gallery__meta">
                                {selected.case_title} — {typeLabel(selected)} —{' '}
                                {new Date(selected.captured_at).toLocaleString('az-AZ')}
                            </p>
                            <button
                                type="button"
                                className="media-gallery__delete-btn"
                                disabled={deleting}
                                onClick={deleteCurrent}
                            >
                                Bu faylı sil
                            </button>
                        </div>
                        {selected.type === 'photo' && previewUrl && (
                            <img
                                src={previewUrl}
                                alt="Subyekt foto"
                                className="media-gallery__img"
                            />
                        )}
                        {selected.type === 'video' && previewUrl && (
                            <video src={previewUrl} controls className="media-gallery__video" />
                        )}
                        {selected.type === 'audio' && previewUrl && (
                            <audio src={previewUrl} controls className="media-gallery__audio" />
                        )}
                        {section === 'periodic' && filteredAll.length > 1 && (
                            <div className="media-gallery__thumb-grid">
                                {filteredAll.slice(0, 12).map((item) => (
                                    <ThumbCell
                                        key={item.id}
                                        item={item}
                                        active={selected?.id === item.id}
                                        onSelect={() => setSelected(item)}
                                    />
                                ))}
                            </div>
                        )}
                        {!previewUrl && (
                            <p className="media-gallery__hint">Önizləmə yüklənir...</p>
                        )}
                    </>
                ) : (
                    <p className="media-gallery__hint">Soldan media seçin</p>
                )}
            </main>
        </div>
    );
}

function ThumbCell({ item, active, onSelect }) {
    const [url, setUrl] = useState(null);
    useEffect(() => {
        let revoked = null;
        getMediaObjectUrl(item.id)
            .then((u) => {
                revoked = u;
                setUrl(u);
            })
            .catch(() => setUrl(null));
        return () => {
            if (revoked) URL.revokeObjectURL(revoked);
        };
    }, [item.id]);

    return (
        <button
            type="button"
            className={`media-gallery__thumb-btn${active ? ' is-active' : ''}`}
            onClick={onSelect}
        >
            {url ? <img src={url} alt="" /> : <span>…</span>}
        </button>
    );
}

export default MediaGalleryPage;
