import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl/dist/maplibre-gl.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import './MapLibre3D.css';

function MapLibre3D({ devices, centerLat, centerLon }) {
    const containerRef = useRef(null);
    const mapRef = useRef(null);
    const markersRef = useRef([]);

    useEffect(() => {
        if (!containerRef.current || centerLat == null) return;

        const map = new maplibregl.Map({
            container: containerRef.current,
            style: 'https://demotiles.maplibre.org/style.json',
            center: [centerLon, centerLat],
            zoom: 15,
            pitch: 60,
            bearing: -20,
            antialias: true
        });

        map.addControl(new maplibregl.NavigationControl(), 'top-right');
        mapRef.current = map;

        return () => {
            markersRef.current.forEach((m) => m.remove());
            map.remove();
            mapRef.current = null;
        };
    }, [centerLat, centerLon]);

    useEffect(() => {
        if (!mapRef.current) return;
        markersRef.current.forEach((m) => m.remove());
        markersRef.current = [];

        (devices || []).forEach((d) => {
            if (d.lat == null || d.lon == null) return;
            const el = document.createElement('div');
            el.className = 'maplibre-marker';
            el.title = d.device_name || d.device_id;
            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([d.lon, d.lat])
                .addTo(mapRef.current);
            markersRef.current.push(marker);
        });
    }, [devices]);

    return <div ref={containerRef} className="maplibre-3d-root" />;
}

export default MapLibre3D;
