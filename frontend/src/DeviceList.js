import React from 'react';
import './DeviceList.css';

function DeviceList({ devices, onSelect, selectedId, currentDeviceId = null }) {
    const userDevices = devices
        .filter((d) => d.device_id?.startsWith('user_') && d.lat != null && d.lon != null)
        .sort((a, b) => new Date(b.lastUpdate || 0) - new Date(a.lastUpdate || 0));

    return (
        <div className="device-list">
            <h3>📱 Aktiv cihazlar ({userDevices.length})</h3>
            <div className="device-items">
                {userDevices.length === 0 ? (
                    <div style={{ padding: '1rem', textAlign: 'center', color: '#aaa' }}>
                        Konum gözlənilir — sayta daxil olan istifadəçilər burada görünəcək
                    </div>
                ) : (
                    userDevices.map((device) => {
                        const isMe = device.device_id === currentDeviceId;
                        return (
                            <div
                                key={device.device_id}
                                className={`device-item ${selectedId === device.device_id ? 'selected' : ''}`}
                                onClick={() => onSelect(device)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => e.key === 'Enter' && onSelect(device)}
                            >
                                <div className="device-header">
                                    <span className="device-id">
                                        {isMe ? '📍 Siz — ' : '📱 '}
                                        {device.device_name || device.device_id}
                                    </span>
                                    <span
                                        className={`device-status ${device.is_moving ? 'moving' : 'stopped'}`}
                                    >
                                        {device.is_moving ? '🏃' : '⏸️'}
                                    </span>
                                </div>
                                <div
                                    style={{
                                        fontSize: '0.85rem',
                                        color: '#666',
                                        marginBottom: '0.5rem'
                                    }}
                                >
                                    {device.device_type} • {device.browser}
                                    {device.battery_level !== undefined && (
                                        <>
                                            {' • '}
                                            <span
                                                style={{
                                                    color:
                                                        device.battery_level > 50
                                                            ? '#22C55E'
                                                            : device.battery_level > 20
                                                              ? '#EAB308'
                                                              : '#EF4444'
                                                }}
                                            >
                                                🔋 {device.battery_level}%
                                            </span>
                                        </>
                                    )}
                                </div>
                                <div className="device-info">
                                    <div>
                                        📍 {device.lat?.toFixed(5)}, {device.lon?.toFixed(5)}
                                    </div>
                                    <div>⚡ {((device.speed || 0) * 3.6).toFixed(1)} km/h</div>
                                    <div className="device-time">
                                        {device.lastUpdate
                                            ? new Date(device.lastUpdate).toLocaleTimeString()
                                            : '—'}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export default DeviceList;
