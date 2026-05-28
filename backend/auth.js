const ADMIN_API_KEY = process.env.ADMIN_API_KEY || process.env.ADMIN_KEY || '';
const ADMIN_PIN = process.env.ADMIN_PIN || '';

function verifyAdminCredentials({ pin, password } = {}) {
    if (!ADMIN_API_KEY && !ADMIN_PIN) return true;
    const p = pin != null ? String(pin).trim() : '';
    const pass = password != null ? String(password).trim() : '';
    if (ADMIN_PIN && p && p === ADMIN_PIN) return true;
    if (pass && pass === ADMIN_API_KEY) return true;
    if (p && p === ADMIN_API_KEY) return true;
    return false;
}

function handleAdminLogin(req, res) {
    const { pin, password } = req.body || {};
    if (verifyAdminCredentials({ pin, password })) {
        return res.json({ ok: true });
    }
    return res.status(401).json({
        error: 'invalid_credentials',
        message: 'PIN və ya parol səhvdir'
    });
}

function requireAdminKey(req, res, next) {
    if (!ADMIN_API_KEY) return next();
    const key =
        req.headers['x-admin-key'] ||
        req.query.key ||
        req.query.admin_key;
    if (key === ADMIN_API_KEY) return next();
    return res.status(401).json({ error: 'unauthorized', message: 'Admin API key tələb olunur' });
}

module.exports = {
    requireAdminKey,
    handleAdminLogin,
    verifyAdminCredentials,
    ADMIN_API_KEY,
    ADMIN_PIN
};
