/**
 * Azərbaycan region bbox-ları (python location_resolver ilə uyğun).
 */

const REGIONS = {
    absheron: {
        bbox: [40.25, 49.55, 40.65, 50.15],
        center: [40.4093, 49.8671],
        label: 'Bakı / Abşeron'
    },
    lankaran: {
        bbox: [38.65, 48.7, 38.9, 49.05],
        center: [38.754, 48.8506],
        label: 'Lənkəran'
    },
    ganja: {
        bbox: [40.55, 46.25, 40.85, 46.6],
        center: [40.6828, 46.3606],
        label: 'Gəncə'
    },
    shaki: {
        bbox: [41.55, 47.05, 41.75, 47.3],
        center: [41.1917, 47.1706],
        label: 'Şəki'
    },
    quba: {
        bbox: [41.3, 48.3, 41.5, 48.55],
        center: [41.3611, 48.5136],
        label: 'Quba'
    },
    yevlax: {
        bbox: [40.45, 47.0, 40.75, 47.6],
        center: [40.6172, 47.15],
        label: 'Yevlax'
    },
    mingachevir: {
        bbox: [40.7, 46.9, 40.85, 47.25],
        center: [40.7703, 47.0486],
        label: 'Mingəçevir'
    },
    shirvan: {
        bbox: [39.85, 48.8, 40.05, 49.1],
        center: [39.9317, 48.9203],
        label: 'Şirvan'
    },
    sumgait: {
        bbox: [40.55, 49.5, 40.65, 49.75],
        center: [40.5897, 49.6686],
        label: 'Sumqayıt'
    }
};

function inBbox(lat, lon, bbox) {
    const [latMin, lonMin, latMax, lonMax] = bbox;
    return lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax;
}

function regionForCoords(lat, lon) {
    for (const [key, meta] of Object.entries(REGIONS)) {
        if (inBbox(lat, lon, meta.bbox)) return key;
    }
    return 'unknown';
}

function getRegionMeta(lat, lon) {
    const key = regionForCoords(lat, lon);
    if (key === 'unknown') return { region_key: key, region_label: '' };
    return { region_key: key, region_label: REGIONS[key].label };
}

module.exports = { REGIONS, regionForCoords, getRegionMeta, inBbox };
