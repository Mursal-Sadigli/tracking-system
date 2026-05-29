import React from 'react';

function LevelUpOverlay({ level, onDone }) {
    return (
        <div className="level-up-overlay" role="dialog" aria-label={`Level ${level}`}>
            <div>
                <p className="level-up-overlay__text">LEVEL {level}</p>
                <button type="button" className="pulse-result__btn" onClick={onDone}>
                    Davam et
                </button>
            </div>
        </div>
    );
}

export default LevelUpOverlay;
