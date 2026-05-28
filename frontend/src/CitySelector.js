import React, { useState } from 'react';
import { API_BASE_URL } from './config';
import './CitySelector.css';

function CitySelector({ onCitySelect, isSimulating, onStop }) {
    const [city, setCity] = useState('baku');
    const [vehicleCount, setVehicleCount] = useState(30);
    const [loading, setLoading] = useState(false);

    const cities = [
        { name: 'baku', label: 'Bakı' },
        { name: 'lankaran', label: 'Lənkəran' },
        { name: 'quba', label: 'Quba' },
        { name: 'shaki', label: 'Şəki' },
        { name: 'ganja', label: 'Gəncə' },
        { name: 'sumqait', label: 'Sumqayıt' }
    ];

    const handleStart = async () => {
        setLoading(true);
        try {
            const roadsRes = await fetch(`${API_BASE_URL}/api/city/roads/${city}`);
            const roadsData = await roadsRes.json();

            const vehiclesRes = await fetch(`${API_BASE_URL}/api/city/vehicles/${city}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ count: vehicleCount })
            });

            if (vehiclesRes.ok) {
                onCitySelect({ city, roads: roadsData.roads, vehicleCount });
            }
        } catch (error) {
            console.error('Start error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleStop = async () => {
        try {
            await fetch(`${API_BASE_URL}/api/city/vehicles/${city}/stop`, {
                method: 'POST'
            });
            onStop();
        } catch (error) {
            console.error('Stop error:', error);
        }
    };

    return (
        <div className="city-selector">
            <div className="selector-content">
                <h3>🗺️ Şəhər Seçin</h3>

                <div className="selector-group">
                    <label>Şəhər:</label>
                    <select
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        disabled={isSimulating}
                    >
                        {cities.map(c => (
                            <option key={c.name} value={c.name}>{c.label}</option>
                        ))}
                    </select>
                </div>

                <div className="selector-group">
                    <label>Avtomobil sayı:</label>
                    <input
                        type="range"
                        min="10"
                        max="100"
                        value={vehicleCount}
                        onChange={(e) => setVehicleCount(parseInt(e.target.value))}
                        disabled={isSimulating}
                    />
                    <span>{vehicleCount}</span>
                </div>

                {!isSimulating ? (
                    <button
                        className="start-btn"
                        onClick={handleStart}
                        disabled={loading}
                    >
                        {loading ? '⏳ Başlanıyor...' : '▶️ Başlat'}
                    </button>
                ) : (
                    <button
                        className="stop-btn"
                        onClick={handleStop}
                    >
                        ⏹️ Durdur
                    </button>
                )}
            </div>
        </div>
    );
}

export default CitySelector;
