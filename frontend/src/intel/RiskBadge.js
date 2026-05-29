import React from 'react';
import './RiskBadge.css';

function RiskBadge({ score, riskLevel, compact }) {
    const level = riskLevel || (score != null ? (score < 45 ? 'high' : score < 75 ? 'medium' : 'low') : 'unknown');
    const label = score != null ? score : '—';

    return (
        <span className={`risk-badge risk-badge--${level}${compact ? ' risk-badge--compact' : ''}`} title={`Risk: ${level}`}>
            {compact ? level[0].toUpperCase() : `${label}`}
        </span>
    );
}

export default RiskBadge;
