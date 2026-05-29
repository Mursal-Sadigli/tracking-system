import React from 'react';

function GameShell({ title, score, onBack, children }) {
    return (
        <div className="pulse-shell">
            <div className="pulse-shell__top">
                <button type="button" className="pulse-shell__back" onClick={onBack}>
                    ← Geri
                </button>
                <span className="pulse-shell__score">{score != null ? `Skor: ${score}` : ''}</span>
            </div>
            <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', textAlign: 'center' }}>{title}</h2>
            <div className="pulse-shell__play">{children}</div>
        </div>
    );
}

export default GameShell;
