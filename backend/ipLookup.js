const axios = require('axios');

const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;

async function lookupIp(ip) {
    if (!ip || ip === '127.0.0.1' || ip.startsWith('::')) {
        return { ip, isp: null, org: null, country: null, city: null, mobile: false };
    }

    const cached = cache.get(ip);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

    try {
        const res = await axios.get(`http://ip-api.com/json/${ip}?fields=status,country,city,isp,org,mobile,query`, {
            timeout: 4000
        });
        if (res.data?.status === 'success') {
            const data = {
                ip: res.data.query || ip,
                isp: res.data.isp || null,
                org: res.data.org || null,
                country: res.data.country || null,
                city: res.data.city || null,
                mobile: !!res.data.mobile
            };
            cache.set(ip, { at: Date.now(), data });
            return data;
        }
    } catch (e) {
        console.warn('IP lookup:', e.message);
    }

    return { ip, isp: null, org: null, country: null, city: null, mobile: false };
}

module.exports = { lookupIp };
