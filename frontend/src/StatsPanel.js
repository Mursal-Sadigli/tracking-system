import React from 'react';
import './StatsPanel.css';

function StatsPanel({ stats, alerts, smartFleet, anomalies = [], routeInsight = null }) {
    return (
        <div className="stats-panel">
            <div className="stats-cards">
                <div className="stat-card">
                    <div className="stat-value">{smartFleet?.totalDevices ?? stats?.total_devices ?? 0}</div>
                    <div className="stat-label">Aktiv Cihaz</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{Math.round(smartFleet?.avgSpeedKmh ?? stats?.avg_speed ?? 0)} km/h</div>
                    <div className="stat-label">Orta Sürət</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{smartFleet?.highRiskDevices ?? 0}</div>
                    <div className="stat-label">Riskli Cihaz</div>
                </div>
            </div>

            <div className="alerts-section">
                <h4>🧠 Smart Fleet</h4>
                <div className="alerts-list">
                    <div className="alert-item">Hərəkətli cihazlar: {smartFleet?.movingDevices ?? 0}</div>
                    <div className="alert-item">Online cihazlar: {smartFleet?.onlineDevices ?? 0}</div>
                    <div className="alert-item">AI risk zonasının sayı: {smartFleet?.highRiskDevices ?? 0}</div>
                    <div className="alert-item">Anomaliya: {anomalies.length}</div>
                    <div className="alert-item">Route score: {routeInsight?.points ? 'Aktiv' : 'Heç bir tarixçə yoxdur'}</div>
                </div>
            </div>
            
            {routeInsight?.recommendation && (
                <div className="alerts-section">
                    <h4>🧭 Route Optimization</h4>
                    <div className="alerts-list">
                        <div className="alert-item">Qısa yol: {routeInsight.recommendation.short || '—'}</div>
                        <div className="alert-item">Təhlükəsizlik: {routeInsight.recommendation.safe || '—'}</div>
                        <div className="alert-item">Səmərəlilik: {routeInsight.recommendation.efficient || '—'}</div>
                    </div>
                </div>
            )}

            <div className="alerts-section">
                <h4>⚠️ Bildirişlər</h4>
                <div className="alerts-list">
                    {alerts.length === 0 ? (
                        <div className="no-alerts">Heç bir bildiriş yoxdur</div>
                    ) : (
                        alerts.map((alert, idx) => (
                            <div key={idx} className="alert-item">
                                <div className="alert-time">
                                    {new Date().toLocaleTimeString()}
                                </div>
                                <div className="alert-message">{alert.message}</div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

export default StatsPanel;