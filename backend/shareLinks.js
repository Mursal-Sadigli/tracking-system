const crypto = require('crypto');
const { store, persist } = require('./store');

function createShareLink(caseId, expiresMinutes = 60) {
    const token = crypto.randomBytes(10).toString('hex');
    const expires_at = new Date(Date.now() + expiresMinutes * 60 * 1000).toISOString();
    const link = {
        token,
        case_id: caseId,
        created_at: new Date().toISOString(),
        expires_at,
        expires_minutes: expiresMinutes,
        views: 0
    };
    if (!store.shareLinks) store.shareLinks = new Map();
    store.shareLinks.set(token, link);
    persist();
    return link;
}

function getShareLink(token) {
    if (!store.shareLinks) return null;
    const link = store.shareLinks.get(token);
    if (!link) return null;
    if (new Date(link.expires_at) < new Date()) {
        store.shareLinks.delete(token);
        persist();
        return null;
    }
    link.views += 1;
    persist();
    return link;
}

function listShareLinksForCase(caseId) {
    if (!store.shareLinks) return [];
    return Array.from(store.shareLinks.values()).filter((l) => l.case_id === caseId);
}

module.exports = { createShareLink, getShareLink, listShareLinksForCase };
