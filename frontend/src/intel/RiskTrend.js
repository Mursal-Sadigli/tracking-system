import React from 'react';
import './RiskTrend.css';

function RiskTrend({ history = [] }) {
    if (!history.length) {
        return <p className="risk-trend__empty">Hələ risk tarixçəsi yoxdur</p>;
    }

    const max = 100;
    const points = history.slice(-24);

    return (
        <div className="risk-trend">
            <div className="risk-trend__bars">
                {points.map((p, i) => (
                    <div
                        key={`${p.ts || i}`}
                        className={`risk-trend__bar risk-trend__bar--${p.risk_level || 'low'}`}
                        style={{ height: `${Math.max(8, (p.score / max) * 100)}%` }}
                        title={`${p.score} — ${new Date(p.ts).toLocaleString('az-AZ')}`}
                    />
                ))}
            </div>
            <div className="risk-trend__labels">
                <span>0</span>
                <span>100</span>
            </div>
        </div>
    );
}

export default RiskTrend;
