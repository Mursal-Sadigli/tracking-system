const axios = require('axios');

/**
 * HERE Traffic Flow API — real yol segmentləri (fərdi telefon deyil).
 */
async function fetchTrafficSegments(bbox) {
    const apiKey = process.env.TRAFFIC_API_KEY || process.env.HERE_API_KEY;
    if (!apiKey) {
        return { segments: [], configured: false, provider: 'here' };
    }

    const { minLat, maxLat, minLon, maxLon } = bbox;
    const bboxParam = `${minLat},${minLon},${maxLat},${maxLon}`;

    try {
        const url = `https://traffic.ls.hereapi.com/traffic/6.3/flow.json`;
        const res = await axios.get(url, {
            params: { apiKey, bbox: bboxParam, responseattributes: 'sh,fc' },
            timeout: 10000
        });

        const segments = [];
        const rme = res.data?.RME?.TRAFFIC?.RWS || [];
        const rows = Array.isArray(rme) ? rme : [rme];

        for (const rw of rows) {
            const rwis = rw?.RWIS || rw?.RW || [];
            const list = Array.isArray(rwis) ? rwis : [rwis];
            for (const item of list) {
                const fis = item?.FIS || item?.FI || [];
                const fiList = Array.isArray(fis) ? fis : [fis];
                for (const fi of fiList) {
                    const shp = fi?.SHP?.value || fi?.SHP;
                    if (!shp) continue;
                    const coords = [];
                    const pairs = String(shp).split(' ');
                    for (let i = 0; i < pairs.length - 1; i += 2) {
                        const lat = parseFloat(pairs[i]);
                        const lon = parseFloat(pairs[i + 1]);
                        if (!Number.isNaN(lat) && !Number.isNaN(lon)) coords.push([lat, lon]);
                    }
                    if (coords.length < 2) continue;
                    const jam = fi?.JF || fi?.jamFactor || 0;
                    segments.push({
                        id: `tr_${segments.length}`,
                        coordinates: coords,
                        source: 'traffic',
                        kind: 'traffic',
                        label: `Trafik JF:${jam}`,
                        jam_factor: Number(jam) || 0
                    });
                }
            }
        }

        return { segments: segments.slice(0, 80), configured: true, provider: 'here' };
    } catch (err) {
        console.warn('traffic API:', err.message);
        return { segments: [], configured: true, provider: 'here', error: err.message };
    }
}

module.exports = { fetchTrafficSegments };
