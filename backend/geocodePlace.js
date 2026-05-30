const axios = require('axios');
const { getRegionMeta } = require('./azRegions');

const CACHE_MS = 120000;
const cache = new Map();

const GOOGLE_KEY = process.env.GOOGLE_GEOCODING_API_KEY || '';
const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN || '';

function pickAddrField(addr, keys) {
    for (const k of keys) {
        const v = addr?.[k];
        if (v && String(v).trim()) return String(v).trim();
    }
    return '';
}

function sanitizeAzCityName(city) {
    if (!city) return '';
    const c = String(city).trim();
    const lower = c.toLocaleLowerCase('az');
    if (lower.includes('inzibati') || lower.includes('administrative')) {
        if (lower.includes('bakı') || lower.includes('baku')) return 'Bakı';
        if (lower.includes('lənkəran') || lower.includes('lankaran')) return 'Lənkəran';
        if (lower.includes('sumqayıt') || lower.includes('sumgayit')) return 'Sumqayıt';
        if (lower.includes('gəncə') || lower.includes('gence') || lower.includes('ganja')) return 'Gəncə';
    }
    if (lower === 'baku') return 'Bakı';
    return c.replace(/\s+rayonu$/i, '').trim();
}

function sanitizeDistrictName(district) {
    if (!district) return '';
    return String(district).trim().replace(/\s+rayonu$/i, '').trim();
}

function samePlaceName(a, b) {
    if (!a || !b) return false;
    return String(a).toLocaleLowerCase('az') === String(b).toLocaleLowerCase('az');
}

function buildDisplayLine({ district, suburb, city, region_label }) {
    city = sanitizeAzCityName(city);
    district = district ? sanitizeDistrictName(district) : '';
    const parts = [];
    const local = district || suburb;
    if (local && city && !samePlaceName(local, city)) {
        parts.push(local);
    } else if (local) {
        parts.push(local);
    }
    if (city && !parts.some((p) => samePlaceName(p, city))) {
        parts.push(city);
    }
    if (parts.length === 0 && region_label) parts.push(region_label);
    if (parts.length === 0) return '';
    return parts.join(', ');
}

function normalizePlace(lat, lon, raw) {
    const { region_key, region_label } = getRegionMeta(lat, lon);
    const city = sanitizeAzCityName(raw.city);
    const district = sanitizeDistrictName(raw.district);
    const suburb = raw.suburb ? String(raw.suburb).trim() : '';
    let display_line =
        raw.display_line ||
        buildDisplayLine({
            district,
            suburb,
            city,
            region_label
        });
    if (display_line && /inzibati\s+ərazisi/i.test(display_line)) {
        display_line = buildDisplayLine({ district, suburb, city, region_label });
    }

    return {
        display_line: display_line || region_label || city || '',
        city,
        district,
        suburb: raw.suburb || '',
        country: raw.country || '',
        region_key,
        region_label,
        source: raw.source || 'unknown',
        latitude: Number(lat),
        longitude: Number(lon)
    };
}

async function geocodeGoogle(lat, lon) {
    if (!GOOGLE_KEY) return null;
    try {
        const res = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
            params: { latlng: `${lat},${lon}`, key: GOOGLE_KEY, language: 'az' },
            timeout: 5000
        });
        const result = res.data?.results?.[0];
        if (!result || res.data?.status !== 'OK') return null;

        const components = result.address_components || [];
        const byType = (type) => {
            const c = components.find((x) => x.types?.includes(type));
            return c?.long_name || '';
        };

        const city =
            byType('locality') ||
            byType('administrative_area_level_2') ||
            byType('administrative_area_level_1');
        const district =
            byType('sublocality') ||
            byType('sublocality_level_1') ||
            byType('neighborhood');
        const suburb = byType('administrative_area_level_3');
        const country = byType('country');

        return normalizePlace(lat, lon, {
            city,
            district,
            suburb,
            country,
            display_line: result.formatted_address,
            source: 'google'
        });
    } catch (e) {
        console.warn('Google geocode:', e.message);
        return null;
    }
}

async function geocodeMapbox(lat, lon) {
    if (!MAPBOX_TOKEN) return null;
    try {
        const res = await axios.get(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json`,
            {
                params: {
                    access_token: MAPBOX_TOKEN,
                    language: 'az',
                    types: 'address,place,locality,neighborhood,district'
                },
                timeout: 5000
            }
        );
        const feat = res.data?.features?.[0];
        if (!feat) return null;

        const ctx = feat.context || [];
        const ctxName = (prefix) => {
            const item = ctx.find((c) => c.id?.startsWith(prefix));
            return item?.text || '';
        };

        const city = ctxName('place.') || ctxName('region.') || '';
        const district = feat.text || ctxName('locality.') || ctxName('neighborhood.');
        const country = ctxName('country.');

        return normalizePlace(lat, lon, {
            city,
            district,
            suburb: '',
            country,
            display_line: feat.place_name || feat.text,
            source: 'mapbox'
        });
    } catch (e) {
        console.warn('Mapbox geocode:', e.message);
        return null;
    }
}

async function geocodeNominatim(lat, lon) {
    try {
        const res = await axios.get('https://nominatim.openstreetmap.org/reverse', {
            params: {
                lat,
                lon,
                format: 'json',
                zoom: 16,
                addressdetails: 1,
                'accept-language': 'az,en'
            },
            timeout: 6000,
            headers: { 'User-Agent': 'TrackingSystem-Node/1.0' }
        });
        const addr = res.data?.address || {};
        const suburb = pickAddrField(addr, [
            'suburb',
            'neighbourhood',
            'quarter',
            'residential'
        ]);
        const district = pickAddrField(addr, [
            'city_district',
            'district',
            'borough',
            'municipality'
        ]);
        const city = pickAddrField(addr, ['city', 'town', 'village', 'county']);
        const country = pickAddrField(addr, ['country']);

        const { region_label } = getRegionMeta(lat, lon);
        let display_line = buildDisplayLine({ district, suburb, city, region_label });
        if (!display_line && res.data?.display_name) {
            const parts = String(res.data.display_name).split(',').map((s) => s.trim());
            display_line = parts.slice(0, 2).join(', ');
        }

        return normalizePlace(lat, lon, {
            city,
            district,
            suburb,
            country,
            display_line,
            source: 'nominatim'
        });
    } catch (e) {
        console.warn('Nominatim geocode:', e.message);
        return null;
    }
}

function geocodeRegionOnly(lat, lon) {
    const { region_key, region_label } = getRegionMeta(lat, lon);
    if (region_key === 'unknown') return null;
    return normalizePlace(lat, lon, {
        city: region_label,
        district: '',
        suburb: '',
        country: 'Azərbaycan',
        display_line: region_label,
        source: 'region_bbox'
    });
}

/**
 * GPS koordinatından şəhər/rayon (Google → Mapbox → Nominatim → region bbox).
 */
async function reverseGeocodePlace(latitude, longitude) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return normalizePlace(0, 0, { city: '', district: '', suburb: '', country: '', source: 'invalid' });
    }

    const key = `${lat.toFixed(5)}_${lon.toFixed(5)}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.data;

    let place =
        (await geocodeGoogle(lat, lon)) ||
        (await geocodeMapbox(lat, lon)) ||
        (await geocodeNominatim(lat, lon)) ||
        geocodeRegionOnly(lat, lon);

    if (!place) {
        place = normalizePlace(lat, lon, {
            city: '',
            district: '',
            suburb: '',
            country: '',
            display_line: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
            source: 'coords_only'
        });
    }

    cache.set(key, { at: Date.now(), data: place });
    return place;
}

module.exports = { reverseGeocodePlace, buildDisplayLine };
