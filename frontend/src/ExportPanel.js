import React, { useState } from 'react';
import { API_BASE_URL } from './config';
import './ExportPanel.css';

function ExportPanel({ device }) {
    const [isExporting, setIsExporting] = useState(false);
    const [dateRange, setDateRange] = useState('today');

    const generateCSV = async () => {
        if (!device) return;

        setIsExporting(true);

        try {
            // Fetch history
            const response = await fetch(`${API_BASE_URL}/api/devices/${device.device_id}/history`);
            const history = await response.json() || [];

            if (history.length === 0) {
                alert('Tarixçə boşdur');
                setIsExporting(false);
                return;
            }

            // CSV header
            const headers = [
                'Timestamp',
                'Latitude',
                'Longitude',
                'Speed (km/h)',
                'Heading (°)',
                'Battery (%)',
                'Accuracy',
                'Device Name',
                'Device Type'
            ];

            // CSV rows
            const rows = history.map(point => [
                new Date(point.timestamp).toLocaleString(),
                point.lat?.toFixed(6) || '',
                point.lon?.toFixed(6) || '',
                (point.speed * 3.6).toFixed(1),
                Math.round(point.heading || 0),
                point.battery_level || '',
                point.accuracy || '',
                device.device_name || '',
                device.device_type || ''
            ]);

            // Calculate statistics
            const totalPoints = history.length;
            const avgSpeed = history.length > 0 
                ? (history.reduce((sum, p) => sum + (p.speed || 0), 0) / history.length * 3.6).toFixed(2)
                : 0;
            const maxSpeed = history.length > 0
                ? Math.max(...history.map(p => (p.speed || 0) * 3.6)).toFixed(2)
                : 0;
            const minBattery = history.length > 0
                ? Math.min(...history.map(p => p.battery_level || 100))
                : 100;

            // Summary row
            const summary = [
                ['SUMMARY'],
                ['Total Points', totalPoints],
                ['Average Speed', `${avgSpeed} km/h`],
                ['Maximum Speed', `${maxSpeed} km/h`],
                ['Minimum Battery', `${minBattery}%`],
                ['Device', device.device_name],
                ['Export Date', new Date().toLocaleString()]
            ];

            // Build CSV content
            let csvContent = headers.join(',') + '\n';
            csvContent += rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
            csvContent += '\n\n';
            csvContent += summary.map(row => row.join(',')).join('\n');

            // Download file
            const element = document.createElement('a');
            element.setAttribute('href', 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent));
            element.setAttribute('download', `tracking_${device.device_id}_${new Date().getTime()}.csv`);
            element.style.display = 'none';
            document.body.appendChild(element);
            element.click();
            document.body.removeChild(element);

            setIsExporting(false);
        } catch (error) {
            console.error('Export error:', error);
            alert('Export xətası');
            setIsExporting(false);
        }
    };

    return (
        <div className="export-panel">
            <h3>📥 Məlumat Endi</h3>
            
            <div className="export-device">
                <strong>📱 {device?.device_name || 'Device'}</strong>
            </div>

            <div className="export-options">
                <label>
                    <input
                        type="radio"
                        name="dateRange"
                        value="today"
                        checked={dateRange === 'today'}
                        onChange={(e) => setDateRange(e.target.value)}
                    />
                    Bugün
                </label>
                <label>
                    <input
                        type="radio"
                        name="dateRange"
                        value="week"
                        checked={dateRange === 'week'}
                        onChange={(e) => setDateRange(e.target.value)}
                    />
                    Son 7 gün
                </label>
                <label>
                    <input
                        type="radio"
                        name="dateRange"
                        value="all"
                        checked={dateRange === 'all'}
                        onChange={(e) => setDateRange(e.target.value)}
                    />
                    Hamısı
                </label>
            </div>

            <button 
                className="export-btn"
                onClick={generateCSV}
                disabled={isExporting || !device}
            >
                {isExporting ? '⏳ Endirilib...' : '📊 CSV Endir'}
            </button>

            <div className="export-info">
                <small>
                    📌 CSV faylında tam tarixçə, statistika və cihaz məlumatları olacaq
                </small>
            </div>
        </div>
    );
}

export default ExportPanel;
