const express = require('express');
const path = require('path');
const multer = require('multer');
const cases = require('./cases');
const visits = require('./visits');
const { emitCaseEvent } = require('./events');
const media = require('./media');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 }
});

function createMediaRouter({ io, requireAdminKey }) {
    const router = express.Router();
    const admin = requireAdminKey;

    router.post('/capture', upload.single('file'), (req, res) => {
        try {
            const token = req.body.subject_token;
            const type = req.body.type;
            if (!token || !type || !req.file) {
                return res.status(400).json({ error: 'missing_fields' });
            }
            if (type !== 'photo' && type !== 'video') {
                return res.status(400).json({ error: 'invalid_type' });
            }
            const c = cases.getCaseByToken(token);
            if (!c) return res.status(404).json({ error: 'invalid_token' });
            if (c.status === 'closed') return res.status(410).json({ error: 'case_closed' });

            const maxPhoto = 3 * 1024 * 1024;
            const maxVideo = 15 * 1024 * 1024;
            if (type === 'photo' && req.file.size > maxPhoto) {
                return res.status(413).json({ error: 'file_too_large' });
            }
            if (type === 'video' && req.file.size > maxVideo) {
                return res.status(413).json({ error: 'file_too_large' });
            }

            const saved = media.saveMediaFile(c.case_id, type, req.file.buffer, req.file.mimetype);
            const record = {
                id: saved.id,
                case_id: c.case_id,
                case_title: c.title,
                device_id: c.device_id,
                type,
                filename: saved.filename,
                full_path: saved.fullPath,
                mime: saved.mime,
                size_bytes: req.file.size,
                captured_at: new Date().toISOString(),
                ip: req.ip || req.headers['x-forwarded-for'] || null
            };
            media.addRecord(record);

            if (type === 'photo') visits.markMediaPhoto(token);
            if (type === 'video') visits.markMediaVideo(token);

            const payload = {
                media_id: record.id,
                case_id: c.case_id,
                case_title: c.title,
                type,
                captured_at: record.captured_at,
                mime: record.mime
            };

            if (io) {
                io.emit('media_captured', payload);
                emitCaseEvent(io, {
                    type: 'media_captured',
                    case_id: c.case_id,
                    device_id: c.device_id,
                    payload
                }).catch(() => {});
            }

            res.status(201).json({ ok: true, ...payload });
        } catch (err) {
            console.warn('media capture:', err.message);
            res.status(500).json({ error: 'upload_failed' });
        }
    });

    router.get('/recent', admin, (req, res) => {
        const limit = Number(req.query.limit) || 50;
        res.json({ media: media.listRecent(limit) });
    });

    router.get('/:mediaId/file', admin, (req, res) => {
        const rec = media.getById(req.params.mediaId);
        if (!rec || !rec.full_path) return res.status(404).json({ error: 'not_found' });
        const fs = require('fs');
        if (!fs.existsSync(rec.full_path)) return res.status(404).json({ error: 'file_missing' });
        res.setHeader('Content-Type', rec.mime || 'application/octet-stream');
        res.sendFile(path.resolve(rec.full_path));
    });

    return router;
}

module.exports = { createMediaRouter };
