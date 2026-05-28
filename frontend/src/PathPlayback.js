import React, { useState, useRef, useEffect } from 'react';
import { API_BASE_URL } from './config';
import './PathPlayback.css';

function PathPlayback({ device, onClose }) {
    const [history, setHistory] = useState([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [speed, setSpeed] = useState(1);
    const [loading, setLoading] = useState(true);
    const animationRef = useRef(null);
    const startTimeRef = useRef(null);

    // Fetch device history on mount
    useEffect(() => {
        if (!device) return;

        const fetchHistory = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/devices/${device.device_id}/history`);
                const data = await response.json();
                setHistory(data || []);
                setLoading(false);
            } catch (error) {
                console.error('❌ Failed to fetch history:', error);
                setLoading(false);
            }
        };

        fetchHistory();
    }, [device]);

    // Playback animation loop
    useEffect(() => {
        if (!isPlaying || history.length === 0) return;

        const animate = (timestamp) => {
            if (!startTimeRef.current) {
                startTimeRef.current = timestamp;
            }

            const elapsed = (timestamp - startTimeRef.current) / 1000; // seconds
            const targetIndex = Math.min(
                currentIndex + Math.floor(elapsed * (speed / 1000)),
                history.length - 1
            );

            if (targetIndex >= history.length - 1) {
                setIsPlaying(false);
                setCurrentIndex(history.length - 1);
                startTimeRef.current = null;
                return;
            }

            setCurrentIndex(targetIndex);
            animationRef.current = requestAnimationFrame(animate);
        };

        animationRef.current = requestAnimationFrame(animate);
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [isPlaying, history, currentIndex, speed]);

    const handlePlay = () => {
        if (currentIndex >= history.length - 1) {
            setCurrentIndex(0);
        }
        setIsPlaying(!isPlaying);
        startTimeRef.current = null;
    };

    const handleStop = () => {
        setIsPlaying(false);
        setCurrentIndex(0);
        startTimeRef.current = null;
    };

    const handleSlider = (e) => {
        setCurrentIndex(parseInt(e.target.value));
        setIsPlaying(false);
        startTimeRef.current = null;
    };

    const currentPoint = history[currentIndex] || {};
    const totalDuration = history.length > 0 ? 
        (new Date(history[history.length - 1].timestamp) - new Date(history[0].timestamp)) / 1000 : 0;
    const elapsedTime = currentIndex > 0 ? 
        (new Date(history[currentIndex].timestamp) - new Date(history[0].timestamp)) / 1000 : 0;

    if (loading) {
        return (
            <div className="playback-panel">
                <p>Tarixçə yüklənir...</p>
            </div>
        );
    }

    if (history.length === 0) {
        return (
            <div className="playback-panel">
                <p>Bu cihaz üçün tarixçə mövcud deyil</p>
                <button onClick={onClose}>Kapat</button>
            </div>
        );
    }

    return (
        <div className="playback-panel">
            <div className="playback-header">
                <h3>📍 Tarixçə Oynatma</h3>
                <button className="close-btn" onClick={onClose}>✕</button>
            </div>

            <div className="playback-info">
                <div>
                    <strong>Cihaz:</strong> {device.device_name}
                </div>
                <div>
                    <strong>Nöqtə:</strong> {currentIndex + 1} / {history.length}
                </div>
                <div>
                    <strong>Konum:</strong> {currentPoint.lat?.toFixed(5)}, {currentPoint.lon?.toFixed(5)}
                </div>
                <div>
                    <strong>Sürət:</strong> {(currentPoint.speed * 3.6).toFixed(1)} km/h
                </div>
                <div>
                    <strong>İstiqamət:</strong> {Math.round(currentPoint.heading || 0)}°
                </div>
            </div>

            <div className="playback-timeline">
                <input 
                    type="range" 
                    min="0" 
                    max={history.length - 1} 
                    value={currentIndex}
                    onChange={handleSlider}
                    className="timeline-slider"
                />
            </div>

            <div className="playback-time">
                <span>{Math.floor(elapsedTime / 60)}:{String(Math.floor(elapsedTime % 60)).padStart(2, '0')}</span>
                <span>/</span>
                <span>{Math.floor(totalDuration / 60)}:{String(Math.floor(totalDuration % 60)).padStart(2, '0')}</span>
            </div>

            <div className="playback-controls">
                <button onClick={handlePlay} className="play-btn">
                    {isPlaying ? '⏸️ Pause' : '▶️ Play'}
                </button>
                <button onClick={handleStop} className="stop-btn">
                    ⏹️ Stop
                </button>
            </div>

            <div className="playback-speed">
                <label>Sürət:</label>
                <select value={speed} onChange={(e) => setSpeed(parseInt(e.target.value))}>
                    <option value={1}>1x</option>
                    <option value={2}>2x</option>
                    <option value={4}>4x</option>
                    <option value={8}>8x</option>
                </select>
            </div>
        </div>
    );
}

export default PathPlayback;
