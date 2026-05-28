import React, { useState, useEffect } from 'react';
import alertManager, { ALERT_TYPES, ALERT_SEVERITY } from './AlertManager';
import './AlertPanel.css';

function AlertPanel() {
    const [alerts, setAlerts] = useState([]);

    useEffect(() => {
        // Subscribe to alert updates
        const unsubscribe = alertManager.subscribe(setAlerts);
        return unsubscribe;
    }, []);

    const getAlertIcon = (type) => {
        switch (type) {
            case ALERT_TYPES.SPEED_ALERT:
                return '⚡';
            case ALERT_TYPES.OFFLINE_ALERT:
                return '📵';
            case ALERT_TYPES.BATTERY_ALERT:
                return '🔋';
            case ALERT_TYPES.GEOFENCE_ALERT:
                return '📍';
            default:
                return 'ℹ️';
        }
    };

    const getAlertColor = (severity) => {
        switch (severity) {
            case ALERT_SEVERITY.CRITICAL:
                return '#ef4444'; // red
            case ALERT_SEVERITY.WARNING:
                return '#f59e0b'; // amber
            case ALERT_SEVERITY.INFO:
                return '#3b82f6'; // blue
            default:
                return '#6b7280'; // gray
        }
    };

    if (alerts.length === 0) return null;

    return (
        <div className="alert-panel">
            {alerts.map((alert) => (
                <div
                    key={alert.id}
                    className="alert-item"
                    style={{ borderLeftColor: getAlertColor(alert.severity) }}
                >
                    <span className="alert-icon">{getAlertIcon(alert.type)}</span>
                    <div className="alert-content">
                        <div className="alert-message">{alert.message}</div>
                        <div className="alert-time">
                            {alert.timestamp.toLocaleTimeString()}
                        </div>
                    </div>
                    <button
                        className="alert-close"
                        onClick={() => alertManager.dismissAlert(alert.id)}
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}

export default AlertPanel;
