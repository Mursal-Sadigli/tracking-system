// Alert Manager - handles alert creation and lifecycle
class AlertManager {
    constructor() {
        this.alerts = [];
        this.listeners = [];
    }

    subscribe(listener) {
        this.listeners.push(listener);
        // Don't call listener immediately on subscription to avoid setState during render
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notify() {
        this.listeners.forEach(listener => listener(this.alerts));
    }

    addAlert(type, message, severity = 'warning') {
        const alert = {
            id: Date.now() + Math.random(),
            type,
            message,
            severity,
            timestamp: new Date(),
            dismissed: false
        };

        this.alerts.push(alert);
        this.notify();

        // Auto-dismiss after 10 seconds unless critical
        if (severity !== 'critical') {
            setTimeout(() => this.dismissAlert(alert.id), 10000);
        }

        return alert.id;
    }

    dismissAlert(id) {
        this.alerts = this.alerts.filter(a => a.id !== id);
        this.notify();
    }

    clearAll() {
        this.alerts = [];
        this.notify();
    }

    getAlerts() {
        return this.alerts.filter(a => !a.dismissed);
    }
}

// Alert Types
export const ALERT_TYPES = {
    SPEED_ALERT: 'SPEED_ALERT',
    OFFLINE_ALERT: 'OFFLINE_ALERT',
    GEOFENCE_ALERT: 'GEOFENCE_ALERT',
    BATTERY_ALERT: 'BATTERY_ALERT'
};

// Alert Severity Levels
export const ALERT_SEVERITY = {
    INFO: 'info',
    WARNING: 'warning',
    CRITICAL: 'critical'
};

// Speed threshold (km/h)
export const SPEED_THRESHOLD = 50;

// Offline timeout (milliseconds)
export const OFFLINE_TIMEOUT = 30000;

const alertManager = new AlertManager();

export default alertManager;
