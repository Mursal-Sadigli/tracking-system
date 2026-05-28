const ADMIN_API_KEY = process.env.ADMIN_API_KEY || process.env.ADMIN_KEY || '';

function requireAdminKey(req, res, next) {
    if (!ADMIN_API_KEY) return next();
    const key =
        req.headers['x-admin-key'] ||
        req.query.key ||
        req.query.admin_key;
    if (key === ADMIN_API_KEY) return next();
    return res.status(401).json({ error: 'unauthorized', message: 'Admin API key tələb olunur' });
}

module.exports = { requireAdminKey, ADMIN_API_KEY };
