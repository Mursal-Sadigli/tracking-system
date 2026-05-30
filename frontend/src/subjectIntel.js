import { getDeviceInfo, getNetworkInfo } from './deviceInfo';
import { isSecureLocationContext, GPS_OPTIONS } from './geolocation';
import { resolveLocationApi } from './api';

function guessRegionFromClient() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const lang = (navigator.language || '').toLowerCase();
    if (tz === 'Asia/Baku' || lang.startsWith('az')) {
        return { country: 'Azərbaycan', city: '', source: 'timezone_lang' };
    }
    if (lang.startsWith('tr')) {
        return { country: 'Türkiyə (təxmini)', city: '', source: 'language' };
    }
    if (lang.startsWith('ru')) {
        return { country: 'Rusiya (təxmini)', city: '', source: 'language' };
    }
    return { country: '', city: '', source: 'unknown' };
}

function parseBrowserVersion(ua) {
    const chrome = ua.match(/Chrome\/([\d.]+)/);
    if (chrome && !/Edg\//.test(ua)) return { engine: 'Chrome', version: chrome[1] };
    const safari = ua.match(/Version\/([\d.]+).*Safari/);
    if (safari && /Safari/.test(ua) && !/Chrome/.test(ua)) return { engine: 'Safari', version: safari[1] };
    const ff = ua.match(/Firefox\/([\d.]+)/);
    if (ff) return { engine: 'Firefox', version: ff[1] };
    const edg = ua.match(/Edg\/([\d.]+)/);
    if (edg) return { engine: 'Edge', version: edg[1] };
    return { engine: '', version: '' };
}

async function readPermissionStates() {
    const out = {};
    const checks = [
        ['geolocation', { name: 'geolocation' }],
        ['notifications', { name: 'notifications' }],
        ['camera', { name: 'camera' }],
        ['microphone', { name: 'microphone' }]
    ];
    for (const [key, query] of checks) {
        try {
            if (!navigator.permissions?.query) {
                out[key] = 'unsupported';
                continue;
            }
            const status = await navigator.permissions.query(query);
            out[key] = status.state;
        } catch {
            out[key] = 'unknown';
        }
    }
    return out;
}

async function getStorageEstimate() {
    if (!navigator.storage?.estimate) return null;
    try {
        const { quota, usage } = await navigator.storage.estimate();
        return {
            usage_bytes: usage ?? null,
            quota_bytes: quota ?? null,
            usage_mb: usage != null ? Math.round(usage / 1024 / 1024) : null,
            quota_mb: quota != null ? Math.round(quota / 1024 / 1024) : null
        };
    } catch {
        return null;
    }
}

function getGpsLocationPlace() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve(null);
            return;
        }
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const latitude = pos.coords.latitude;
                const longitude = pos.coords.longitude;
                const accuracy = pos.coords.accuracy;
                try {
                    const resolved = await resolveLocationApi(latitude, longitude, accuracy);
                    resolve({
                        latitude,
                        longitude,
                        accuracy,
                        city: resolved.city || '',
                        country: resolved.country || '',
                        region: resolved.region || '',
                        source: 'gps'
                    });
                } catch {
                    resolve({
                        latitude,
                        longitude,
                        accuracy,
                        city: '',
                        country: '',
                        source: 'gps_coords_only'
                    });
                }
            },
            () => resolve(null),
            { ...GPS_OPTIONS, timeout: 12000, maximumAge: 120000 }
        );
    });
}

/**
 * Şəffaf, icazəli texniki profil (spyware deyil).
 */
export async function collectSubjectIntelSnapshot(phase = 'initial') {
    const base = getDeviceInfo();
    const net = getNetworkInfo();
    const browserVer = parseBrowserVersion(base.user_agent || '');
    const region = guessRegionFromClient();
    const permissions = await readPermissionStates();
    const storage = await getStorageEstimate();
    const location = await getGpsLocationPlace();

    return {
        phase,
        collected_at: new Date().toISOString(),
        secure_context: isSecureLocationContext(),
        device: {
            ...base,
            browser_version: browserVer.version,
            browser_engine: browserVer.engine,
            platform: navigator.platform || '',
            vendor: navigator.vendor || '',
            hardware_concurrency: navigator.hardwareConcurrency ?? null,
            max_touch_points: navigator.maxTouchPoints ?? null,
            device_memory_gb: navigator.deviceMemory ?? null,
            device_memory_supported: navigator.deviceMemory != null,
            languages: [...(navigator.languages || [base.language])]
        },
        storage,
        location,
        screen: {
            width: window.screen?.width ?? null,
            height: window.screen?.height ?? null,
            avail_width: window.screen?.availWidth ?? null,
            avail_height: window.screen?.availHeight ?? null,
            pixel_ratio: window.devicePixelRatio || 1,
            orientation: window.screen?.orientation?.type || null
        },
        locale: {
            language: base.language,
            timezone: base.timezone,
            region_guess: region
        },
        network: net,
        permissions,
        viewport: {
            width: window.innerWidth,
            height: window.innerHeight
        }
    };
}
