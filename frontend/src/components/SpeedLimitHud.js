import React from 'react';
import './SpeedLimitHud.css';

export default function SpeedLimitHud({ limitKmh, speedKmh, source }) {
    const overLimit =
        limitKmh != null &&
        speedKmh != null &&
        !Number.isNaN(speedKmh) &&
        speedKmh > 0 &&
        speedKmh > limitKmh + 3;

    const showSpeed = speedKmh != null && !Number.isNaN(speedKmh) && speedKmh >= 0;

    return (
        <div className={`speed-limit-hud${overLimit ? ' speed-limit-hud--over' : ''}`}>
            <div className="speed-limit-hud__sign" title={source ? `Mənbə: ${source}` : undefined}>
                <span className="speed-limit-hud__label">LIMIT</span>
                <span className="speed-limit-hud__value">{limitKmh != null ? limitKmh : '—'}</span>
            </div>
            {showSpeed && (
                <div className="speed-limit-hud__current">
                    <span className="speed-limit-hud__current-val">{Math.round(speedKmh)}</span>
                    <span className="speed-limit-hud__unit">km/s</span>
                </div>
            )}
        </div>
    );
}
