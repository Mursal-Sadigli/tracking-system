const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { store, persist } = require('./store');

const MEDIA_ROOT = path.join(__dirname, 'data', 'media');

function ensureMediaRoot() {
    if (!fs.existsSync(MEDIA_ROOT)) fs.mkdirSync(MEDIA_ROOT, { recursive: true });
}

function ensureCaseDir(caseId) {
    ensureMediaRoot();
    const dir = path.join(MEDIA_ROOT, caseId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function saveMediaFile(caseId, type, buffer, mime) {
    const id = `med_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    let ext = 'jpg';
    if (type === 'video') {
        ext = mime && mime.includes('mp4') ? 'mp4' : 'webm';
    } else if (type === 'audio') {
        if (mime && mime.includes('ogg')) ext = 'ogg';
        else if (mime && mime.includes('mp4')) ext = 'm4a';
        else ext = 'webm';
    }
    const filename = `${id}.${ext}`;
    const dir = ensureCaseDir(caseId);
    const fullPath = path.join(dir, filename);
    fs.writeFileSync(fullPath, buffer);
    const defaultMime =
        type === 'video' ? 'video/webm' : type === 'audio' ? 'audio/webm' : 'image/jpeg';
    return { id, filename, fullPath, mime: mime || defaultMime };
}

function addRecord(record) {
    if (!store.mediaRecords) store.mediaRecords = [];
    store.mediaRecords.push(record);
    if (store.mediaRecords.length > 2000) {
        store.mediaRecords = store.mediaRecords.slice(-1500);
    }
    persist();
    return record;
}

function getById(mediaId) {
    return (store.mediaRecords || []).find((r) => r.id === mediaId) || null;
}

function listByCase(caseId, limit = 50) {
    return (store.mediaRecords || [])
        .filter((r) => r.case_id === caseId)
        .slice(-limit)
        .reverse();
}

function listRecent(limit = 50) {
    return (store.mediaRecords || []).slice(-limit).reverse();
}

function deleteById(mediaId) {
    const idx = (store.mediaRecords || []).findIndex((r) => r.id === mediaId);
    if (idx < 0) return null;
    const [rec] = store.mediaRecords.splice(idx, 1);
    try {
        if (rec.full_path && fs.existsSync(rec.full_path)) fs.unlinkSync(rec.full_path);
    } catch {
        /* ignore */
    }
    persist();
    return rec;
}

function deleteByIds(mediaIds) {
    const idSet = new Set(Array.isArray(mediaIds) ? mediaIds : []);
    const removed = [];
    const kept = [];
    for (const r of store.mediaRecords || []) {
        if (idSet.has(r.id)) {
            try {
                if (r.full_path && fs.existsSync(r.full_path)) fs.unlinkSync(r.full_path);
            } catch {
                /* ignore */
            }
            removed.push(r);
        } else {
            kept.push(r);
        }
    }
    store.mediaRecords = kept;
    if (removed.length) persist();
    return removed;
}

function deleteOlderThan(days) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const kept = [];
    let deleted = 0;
    for (const r of store.mediaRecords || []) {
        const ts = new Date(r.captured_at).getTime();
        if (ts < cutoff) {
            try {
                if (r.full_path && fs.existsSync(r.full_path)) fs.unlinkSync(r.full_path);
            } catch {
                /* ignore */
            }
            deleted += 1;
        } else {
            kept.push(r);
        }
    }
    store.mediaRecords = kept;
    persist();
    return deleted;
}

module.exports = {
    MEDIA_ROOT,
    saveMediaFile,
    addRecord,
    getById,
    listByCase,
    listRecent,
    deleteOlderThan,
    deleteById,
    deleteByIds
};
