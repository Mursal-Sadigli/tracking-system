import React, { useEffect, useId, useState } from 'react';
import {
    MapContainer,
    TileLayer,
    Marker,
    Popup,
    Polyline,
    Circle,
    Polygon,
    useMap
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { describeLocationQuality, googleMapsUrl } from './geolocation';
import './MapComponent.css';
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: require('leaflet/dist/images/marker-icon-2x.png'),
    iconUrl: require('leaflet/dist/images/marker-icon.png'),
    shadowUrl: require('leaflet/dist/images/marker-shadow.png')
});

const tileLayers = {
    street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png'
};

const createHeadingIcon = (color, heading) => {
    const arrowSvg = `
        <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(16, 16) rotate(${heading})">
                <path d="M 0,-12 L -8,4 L 0,2 L 8,4 Z" fill="${color}" stroke="white" stroke-width="1"/>
            </g>
        </svg>
    `;
    return new L.Icon({
        iconUrl: `data:image/svg+xml;base64,${btoa(arrowSvg)}`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16],
        shadowSize: [0, 0]
    });
};

function FlyToPosition({ lat, lon }) {
    const map = useMap();

    useEffect(() => {
        if (lat == null || lon == null) return;
        map.flyTo([lat, lon], 15, { duration: 1 });
        map.invalidateSize();
    }, [lat, lon, map]);

    return null;
}

function MapLayers({
    mapLayer,
    markerLat,
    markerLon,
    userLocation,
    myDevice,
    trackedDevices,
    currentDeviceId,
    zonesToRender,
    cityRoads,
    cityVehicles,
    selectedDevice,
    mapReady
}) {
    return (
        <>
            <FlyToPosition lat={markerLat} lon={markerLon} />
            <TileLayer
                key={mapLayer}
                url={tileLayers[mapLayer]}
                attribution={
                    mapLayer === 'satellite'
                        ? '&copy; Esri &copy; OpenStreetMap contributors'
                        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                }
            />

            {zonesToRender.map((zone, index) => (
                <Polygon
                    key={`risk-${index}`}
                    positions={zone}
                    pathOptions={{
                        color: index === 0 ? '#ef4444' : '#f59e0b',
                        fillColor: index === 0 ? '#fecaca' : '#fef3c7',
                        fillOpacity: 0.28
                    }}
                />
            ))}

            {userLocation?.accuracy != null && (
                <Circle
                    center={[markerLat, markerLon]}
                    radius={Math.max(25, userLocation.accuracy)}
                    pathOptions={{
                        color: '#2563eb',
                        fillColor: '#93c5fd',
                        fillOpacity: 0.2,
                        weight: 1
                    }}
                />
            )}

            {trackedDevices.map((device) => {
                if (device.lat == null || device.lon == null) return null;
                const isMe = device.device_id === currentDeviceId;
                const isSelected = selectedDevice?.device_id === device.device_id;
                const color = isMe ? '#22C55E' : isSelected ? '#EAB308' : '#2563eb';
                return (
                    <Marker
                        key={device.device_id}
                        position={[device.lat, device.lon]}
                        icon={createHeadingIcon(color, device.heading || 0)}
                    >
                        <Popup>
                            <div className="marker-popup">
                                <strong>
                                    {isMe ? '📍 Siz' : '📱'} {device.device_name || device.device_id}
                                </strong>
                                <br />
                                <small style={{ color: '#666' }}>
                                    {device.device_type} • {device.browser}
                                </small>
                                <br />
                                <br />
                                🏃 {device.is_moving ? 'Hərəkətdə' : 'Dayanıb'}
                                <br />
                                ⚡ {((device.speed || 0) * 3.6).toFixed(1)} km/h
                                <br />
                                {device.city && (
                                    <>
                                        🏙️ {device.city}
                                        <br />
                                    </>
                                )}
                                📍 {device.lat.toFixed(6)}, {device.lon.toFixed(6)}
                                <br />
                                {device.accuracy != null && (
                                    <>
                                        🎯 {describeLocationQuality(
                                            device.location_quality,
                                            device.accuracy
                                        )}
                                        <br />
                                    </>
                                )}
                                <a
                                    href={googleMapsUrl(device.lat, device.lon)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    Google Maps-də yoxla
                                </a>
                            </div>
                        </Popup>
                    </Marker>
                );
            })}

            {trackedDevices.length === 0 && myDevice && (
                <Marker
                    position={[markerLat, markerLon]}
                    icon={createHeadingIcon('#22C55E', myDevice.heading || 0)}
                >
                    <Popup>
                        <div className="marker-popup">
                            <strong>📱 {myDevice.device_name || 'Sizin cihazınız'}</strong>
                        </div>
                    </Popup>
                </Marker>
            )}

            {cityRoads.map((road, idx) => (
                <Polyline
                    key={`road-${idx}`}
                    positions={road.map((p) => [p.lat, p.lon])}
                    color="#94a3b8"
                    weight={2}
                    opacity={0.4}
                    dashArray="5, 5"
                />
            ))}

            {cityVehicles.map((vehicle) => (
                <Marker
                    key={vehicle.id}
                    position={[vehicle.lat, vehicle.lon]}
                    icon={createHeadingIcon('#2563eb', vehicle.heading || 0)}
                >
                    <Popup>
                        <div className="marker-popup">
                            <strong>🚗 Simulyasiya: {vehicle.id}</strong>
                            <br />
                            📍 {vehicle.lat.toFixed(6)}, {vehicle.lon.toFixed(6)}
                        </div>
                    </Popup>
                </Marker>
            ))}

            {selectedDevice && mapReady && (
                <Polyline positions={[]} color="#e94560" weight={3} opacity={0.7} />
            )}
        </>
    );
}

function LeafletMapInstance({
    mapKey,
    markerLat,
    markerLon,
    mapLayer,
    userLocation,
    myDevice,
    trackedDevices,
    currentDeviceId,
    zonesToRender,
    cityRoads,
    cityVehicles,
    selectedDevice,
    mapReady
}) {
    return (
        <MapContainer
            key={mapKey}
            center={[markerLat, markerLon]}
            zoom={15}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom
        >
            <MapLayers
                mapLayer={mapLayer}
                markerLat={markerLat}
                markerLon={markerLon}
                userLocation={userLocation}
                myDevice={myDevice}
                trackedDevices={trackedDevices}
                currentDeviceId={currentDeviceId}
                zonesToRender={zonesToRender}
                cityRoads={cityRoads}
                cityVehicles={cityVehicles}
                selectedDevice={selectedDevice}
                mapReady={mapReady}
            />
        </MapContainer>
    );
}

function MapComponent({
    devices,
    selectedDevice,
    userLocation,
    currentDeviceId = null,
    riskZones = [],
    cityVehicles = [],
    cityRoads = []
}) {
    const mapKey = useId();
    const [mapLayer, setMapLayer] = useState('street');
    const [mapReady, setMapReady] = useState(false);
    const [mapMounted, setMapMounted] = useState(false);

    useEffect(() => {
        setMapMounted(true);
        setMapReady(true);
        return () => {
            setMapMounted(false);
            setMapReady(false);
        };
    }, []);

    const liveRiskZones = Array.isArray(riskZones[0])
        ? riskZones
        : riskZones.map((zone) => {
              const offset = 0.003 + (zone.weight || 1) * 0.0004;
              return [
                  [zone.lat - offset, zone.lon - offset],
                  [zone.lat + offset, zone.lon - offset],
                  [zone.lat + offset, zone.lon + offset],
                  [zone.lat - offset, zone.lon + offset]
              ];
          });
    const zonesToRender = riskZones.length ? liveRiskZones : [];

    const trackedDevices = devices.filter(
        (d) => d.lat != null && d.lon != null && d.device_id?.startsWith('user_')
    );

    const myDevice = currentDeviceId
        ? devices.find((d) => d.device_id === currentDeviceId)
        : trackedDevices[trackedDevices.length - 1];

    const focusDevice =
        selectedDevice?.lat != null
            ? selectedDevice
            : myDevice || (userLocation ? { lat: userLocation.lat, lon: userLocation.lon } : null);

    const markerLat = focusDevice?.lat ?? userLocation?.lat;
    const markerLon = focusDevice?.lon ?? userLocation?.lon;
    const hasPosition = markerLat != null && markerLon != null;

    if (!hasPosition) {
        return (
            <div className="map-root map-root--empty">
                📡 Konum hələ alınmayıb.
                <br />
                Brauzerdə icazə verin və GPS-i aktiv edin.
            </div>
        );
    }

    if (!mapMounted) {
        return <div className="map-root map-root--loading">Xəritə yüklənir...</div>;
    }

    return (
        <div className="map-root">
            <div className="map-layer-switch">
                {['street', 'satellite', 'terrain'].map((layer) => (
                    <button
                        key={layer}
                        type="button"
                        className={`map-layer-btn${mapLayer === layer ? ' is-active' : ''}`}
                        onClick={() => setMapLayer(layer)}
                    >
                        {layer === 'street' ? 'Street' : layer === 'satellite' ? 'Satellite' : 'Terrain'}
                    </button>
                ))}
            </div>

            <LeafletMapInstance
                mapKey={mapKey}
                markerLat={markerLat}
                markerLon={markerLon}
                mapLayer={mapLayer}
                userLocation={userLocation}
                myDevice={myDevice}
                trackedDevices={trackedDevices}
                currentDeviceId={currentDeviceId}
                zonesToRender={zonesToRender}
                cityRoads={cityRoads}
                cityVehicles={cityVehicles}
                selectedDevice={selectedDevice}
                mapReady={mapReady}
            />
        </div>
    );
}

export default MapComponent;
