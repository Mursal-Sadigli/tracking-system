const crypto = require('crypto');
const { store, persist } = require('./store');
const { pool, DB_ENABLED } = require('./db');

function generateToken() {
    return crypto.randomBytes(12).toString('hex');
}

function caseDeviceId(caseId) {
    return `case_${caseId}`;
}

function serializeCase(c) {
    return {
        ...c,
        subject_url_path: `/s/${c.subject_token}`,
        device_id: c.device_id || caseDeviceId(c.case_id)
    };
}

async function createCase(body = {}) {
    const case_id = `case_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const subject_token = generateToken();
    const device_id = caseDeviceId(case_id);

    const record = {
        case_id,
        title: body.title || `Tapşırıq ${case_id.slice(-6)}`,
        status: 'active',
        priority: body.priority || 'normal',
        subject_token,
        device_id,
        assigned_operators: body.assigned_operator
            ? [body.assigned_operator]
            : body.assigned_operators || [],
        notes: body.notes || '',
        tags: body.tags || [],
        created_at: new Date().toISOString(),
        closed_at: null,
        speed_limit_kmh: body.speed_limit_kmh ?? 80,
        corridor_buffer_m: body.corridor_buffer_m ?? 200
    };

    store.cases.set(case_id, record);
    store.tokenToCase.set(subject_token, case_id);
    store.deviceToCase.set(device_id, case_id);
    persist();

    if (DB_ENABLED) {
        try {
            await pool.execute(
                `INSERT INTO cases (case_id, title, status, priority, subject_token, device_id, notes, speed_limit_kmh, corridor_buffer_m)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    case_id,
                    record.title,
                    record.status,
                    record.priority,
                    subject_token,
                    device_id,
                    record.notes,
                    record.speed_limit_kmh,
                    record.corridor_buffer_m
                ]
            );
        } catch (e) {
            console.warn('DB createCase:', e.message);
        }
    }

    return serializeCase(record);
}

function getCaseById(caseId) {
    const c = store.cases.get(caseId);
    return c ? serializeCase(c) : null;
}

function getCaseByToken(token) {
    const caseId = store.tokenToCase.get(token);
    if (!caseId) return null;
    return getCaseById(caseId);
}

function getCaseByDeviceId(deviceId) {
    const caseId = store.deviceToCase.get(deviceId);
    if (!caseId) return null;
    return getCaseById(caseId);
}

function listCases(filter = {}) {
    let list = Array.from(store.cases.values()).map(serializeCase);
    if (filter.status) list = list.filter((c) => c.status === filter.status);
    if (filter.priority) list = list.filter((c) => c.priority === filter.priority);
    list.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return list;
}

async function updateCase(caseId, patch) {
    const c = store.cases.get(caseId);
    if (!c) return null;

    if (patch.title != null) c.title = patch.title;
    if (patch.status != null) {
        c.status = patch.status;
        if (patch.status === 'closed') c.closed_at = new Date().toISOString();
    }
    if (patch.priority != null) c.priority = patch.priority;
    if (patch.notes != null) c.notes = patch.notes;
    if (patch.assigned_operators != null) c.assigned_operators = patch.assigned_operators;
    if (patch.speed_limit_kmh != null) c.speed_limit_kmh = patch.speed_limit_kmh;

    store.cases.set(caseId, c);
    persist();

    if (DB_ENABLED) {
        try {
            await pool.execute(
                `UPDATE cases SET title=?, status=?, priority=?, notes=?, speed_limit_kmh=?, closed_at=? WHERE case_id=?`,
                [
                    c.title,
                    c.status,
                    c.priority,
                    c.notes,
                    c.speed_limit_kmh,
                    c.closed_at,
                    caseId
                ]
            );
        } catch (e) {
            console.warn('DB updateCase:', e.message);
        }
    }

    return serializeCase(c);
}

async function handoffCase(caseId, operatorId) {
    const c = store.cases.get(caseId);
    if (!c) return null;
    c.assigned_operators = [operatorId];
    store.cases.set(caseId, c);
    persist();
    return serializeCase(c);
}

function addCaseNote(caseId, author, text) {
    const note = {
        id: `note_${Date.now()}`,
        case_id: caseId,
        author: author || 'operator',
        text,
        created_at: new Date().toISOString()
    };
    store.caseNotes.push(note);
    persist();
    return note;
}

function getCaseNotes(caseId) {
    return store.caseNotes.filter((n) => n.case_id === caseId).slice(-50);
}

module.exports = {
    createCase,
    getCaseById,
    getCaseByToken,
    getCaseByDeviceId,
    listCases,
    updateCase,
    handoffCase,
    addCaseNote,
    getCaseNotes,
    caseDeviceId,
    serializeCase
};
