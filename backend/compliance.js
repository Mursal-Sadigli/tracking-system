const crypto = require('crypto');
const { pool, DB_ENABLED } = require('./db');
const consentLogMemory = [];

function hashConsentText(text) {
    return crypto.createHash('sha256').update(text || '').digest('hex').slice(0, 16);
}

async function logConsent({ case_id, subject_token, ip, user_agent, consent_text }) {
    const entry = {
        case_id,
        subject_token,
        ip_address: ip,
        user_agent: (user_agent || '').slice(0, 500),
        consent_text_hash: hashConsentText(consent_text),
        granted_at: new Date().toISOString()
    };
    consentLogMemory.push(entry);
    if (consentLogMemory.length > 2000) consentLogMemory.shift();

    if (DB_ENABLED) {
        try {
            await pool.execute(
                `INSERT INTO consent_logs (case_id, subject_token, ip_address, user_agent, consent_text_hash)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    case_id,
                    subject_token,
                    entry.ip_address,
                    entry.user_agent,
                    entry.consent_text_hash
                ]
            );
        } catch (e) {
            console.warn('consent log DB:', e.message);
        }
    }
    return entry;
}

function getConsentLogs(caseId, limit = 20) {
    return consentLogMemory
        .filter((e) => !caseId || e.case_id === caseId)
        .slice(-limit)
        .reverse();
}

module.exports = { logConsent, getConsentLogs, hashConsentText };
