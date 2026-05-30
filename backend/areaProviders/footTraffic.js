const axios = require('axios');

/**
 * Foursquare Places — real POI/aktivlik (anonim kütlə, fərdi telefon deyil).
 */
async function fetchFootTraffic(bbox) {
    const apiKey = process.env.FOOT_TRAFFIC_API_KEY || process.env.FOURSQUARE_API_KEY;
    if (!apiKey) {
        return { points: [], configured: false, provider: 'foursquare' };
    }

    const centerLat = (bbox.minLat + bbox.maxLat) / 2;
    const centerLon = (bbox.minLon + bbox.maxLon) / 2;
    const radius = Math.min(
        10000,
        Math.max(
            500,
            Math.round(
                Math.sqrt(
                    (bbox.maxLat - bbox.minLat) ** 2 + (bbox.maxLon - bbox.minLon) ** 2
                ) * 111320
            )
        )
    );

    try {
        const res = await axios.get('https://api.foursquare.com/v3/places/search', {
            headers: {
                Authorization: apiKey,
                Accept: 'application/json'
            },
            params: {
                ll: `${centerLat},${centerLon}`,
                radius,
                limit: 30
            },
            timeout: 10000
        });

        const results = res.data?.results || [];
        const points = results
            .filter((p) => p.geocodes?.main?.latitude != null)
            .map((p, i) => ({
                id: `ft_${p.fsq_id || i}`,
                lat: p.geocodes.main.latitude,
                lon: p.geocodes.main.longitude,
                source: 'foot_traffic',
                kind: 'foot_traffic',
                label: p.name || 'Məkan',
                popularity: p.popularity || null
            }));

        return { points, configured: true, provider: 'foursquare' };
    } catch (err) {
        console.warn('foot-traffic API:', err.message);
        return { points: [], configured: true, provider: 'foursquare', error: err.message };
    }
}

module.exports = { fetchFootTraffic };
