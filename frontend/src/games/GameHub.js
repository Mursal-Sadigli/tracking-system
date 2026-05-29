import React from 'react';
import { GAME_HUB_TITLE, GAME_HUB_TAGLINE } from '../config';
import './PulseArena.css';

function GameHub({ progress, onSelectGame }) {
    const { level, xpInfo, unlockedGames, gamesPlayed } = progress;

    return (
        <div className="pulse-arena">
            <header className="pulse-arena__header">
                <h1 className="pulse-arena__title">{GAME_HUB_TITLE}</h1>
                <p className="pulse-arena__tagline">{GAME_HUB_TAGLINE}</p>
            </header>

            <div className="pulse-arena__level-bar">
                <div className="pulse-arena__level-row">
                    <span>Level {level}</span>
                    <span>
                        {xpInfo.current} / {xpInfo.next} XP
                    </span>
                </div>
                <div className="pulse-arena__level-track">
                    <div
                        className="pulse-arena__level-fill"
                        style={{ width: `${Math.round(xpInfo.progress * 100)}%` }}
                    />
                </div>
            </div>

            <div className="pulse-arena__grid">
                {unlockedGames.map((g) => (
                    <button
                        key={g.id}
                        type="button"
                        className={`pulse-game-card${g.unlocked ? '' : ' is-locked'}`}
                        disabled={!g.unlocked}
                        onClick={() => g.unlocked && onSelectGame(g.id)}
                    >
                        <span className="pulse-game-card__icon">{g.icon}</span>
                        <span className="pulse-game-card__name">{g.name}</span>
                        <span className="pulse-game-card__desc">{g.desc}</span>
                        {!g.unlocked && (
                            <span className="pulse-game-card__lock">Level {g.minLevel} lazım</span>
                        )}
                        {g.unlocked && gamesPlayed[g.id] > 0 && (
                            <span className="pulse-game-card__lock" style={{ color: '#86efac' }}>
                                Oynanıb: {gamesPlayed[g.id]}×
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}

export default GameHub;
