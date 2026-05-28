const { store, persist } = require('./store');
const { pool, DB_ENABLED } = require('./db');

function getCaseEvents(caseId, limit = 100) {
    return store.caseEvents
        .filter((e) => !caseId || e.case_id === caseId)
        .slice(-limit)
        .reverse();
}

async function emitCaseEvent(io, { type, case_id, device_id, payload = {} }) {
    const event = {
        id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type,
        case_id,
        device_id: device_id || null,
        payload,
        ts: new Date().toISOString()
    };

    store.caseEvents.push(event);
    if (store.caseEvents.length > 5000) {
        store.caseEvents = store.caseEvents.slice(-4000);
    }
    persist();

    if (DB_ENABLED && case_id) {
        try {
            await pool.execute(
                `INSERT INTO case_events (case_id, event_type, device_id, payload_json, created_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [case_id, type, device_id, JSON.stringify(payload), event.ts]
            );
        } catch (e) {
            console.warn('DB case_event:', e.message);
        }
    }

    if (io) {
        io.to(`case:${case_id}`).emit('case_event', event);
        io.emit('case_event', event);
    }

    return event;
}

module.exports = { emitCaseEvent, getCaseEvents };
