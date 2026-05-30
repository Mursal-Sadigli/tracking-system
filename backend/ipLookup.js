const axios = require('axios');

const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;

function isPrivateIp(ip) {
    const raw = String(ip || '').trim().replace('::ffff:', '');
    if (!raw || raw === '127.0.0.1' || raw === '::1' || raw === 'localhost') return true;
    const m = raw.match(/^(\d+)\.(\d+)\./);
    if (!m) return false;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
}

async function fetchPublicIp() {
    try {
        const res = await axios.get('https://api.ipify.org?format=json', { timeout: 3500 });
        return res.data?.ip || null;
    } catch {
        return null;
    }
}

/**
 * LAN (192.168…) üçün client public_ip və ya ipify fallback.
 */
async function lookupIp(ip, options = {}) {
    const clientPublic = options.publicIp && !isPrivateIp(options.publicIp) ? options.publicIp : null;
    let target = String(ip || '').trim().replace('::ffff:', '');

    if (!target || target === '127.0.0.1' || target.startsWith('::')) {
        target = clientPublic || (await fetchPublicIp()) || target;
    } else if (isPrivateIp(target)) {
        target = clientPublic || (await fetchPublicIp()) || target;
    }

    if (!target || isPrivateIp(target)) {
        return {
            ip: ip || target || null,
            isp: null,
            org: null,
            country: null,
            city: null,
            mobile: false,
            lookup_ip: null
        };
    }

    const cached = cache.get(target);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

    try {
        const res = await axios.get(
            `http://ip-api.com/json/${target}?fields=status,country,city,isp,org,mobile,query`,
            { timeout: 5000 }
        );
        if (res.data?.status === 'success') {
            const data = {
                ip: ip || target,
                lookup_ip: res.data.query || target,
                isp: res.data.isp || null,
                org: res.data.org || null,
                country: res.data.country || null,
                city: res.data.city || null,
                mobile: !!res.data.mobile
            };
            cache.set(target, { at: Date.now(), data });
            return data;
        }
    } catch (e) {
        console.warn('IP lookup:', e.message);
    }

    return {
        ip: ip || target,
        lookup_ip: target,
        isp: null,
        org: null,
        country: null,
        city: null,
        mobile: false
    };
}

module.exports = { lookupIp, isPrivateIp, fetchPublicIp };
