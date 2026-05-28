import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { apiGet } from './api';
import MapComponent from './MapComponent';
import { getTrackingSocket } from './socketService';
import './WatchPage.css';

function WatchPage() {
    const { token } = useParams();
    const [info, setInfo] = useState(null);
    const [device, setDevice] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        apiGet(`/api/share/${token}`)
            .then((data) => {
                setInfo(data);
                if (data.device) setDevice(data.device);
            })
            .catch(() => setError('Link etibarsızdır və ya vaxtı bitib'));
    }, [token]);

    useEffect(() => {
        if (!info?.valid) return;
        const socket = getTrackingSocket();
        const onLoc = (data) => {
            if (data.case_id === info.case_id) {
                setDevice({
                    device_id: data.device_id,
                    lat: data.latitude,
                    lon: data.longitude,
                    speed_kmh: data.speed_kmh,
                    device_name: data.device_name,
                    is_moving: data.is_moving,
                    ip: data.ip,
                    isp: data.isp,
                    network_online: data.network_online,
                    lastUpdate: data.timestamp
                });
            }
        };
        socket.on('location_update', onLoc);
        return () => socket.off('location_update', onLoc);
    }, [info]);

    if (error) {
        return (
            <div className="watch-page">
                <p>{error}</p>
            </div>
        );
    }

    if (!info) {
        return (
            <div className="watch-page">
                <p>Yüklənir...</p>
            </div>
        );
    }

    return (
        <div className="watch-page">
            <header className="watch-page__header">
                <h1>{info.title || 'Canlı izləmə'}</h1>
                <p>Link bitir: {new Date(info.expires_at).toLocaleString('az-AZ')}</p>
            </header>
            {device && (
                <div className="watch-page__stats">
                    <span>{device.network_online === false ? '🔴 Offline' : '🟢 Online'}</span>
                    <span>⚡ {(device.speed_kmh || 0).toFixed(1)} km/saat</span>
                    {device.ip && <span>IP: {device.ip}</span>}
                    {device.isp && <span>ISP: {device.isp}</span>}
                </div>
            )}
            <div className="watch-page__map">
                <MapComponent devices={device ? [device] : []} selectedDevice={device} />
            </div>
        </div>
    );
}

export default WatchPage;
