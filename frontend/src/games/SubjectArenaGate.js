import React, { useState } from 'react';
import { pulseProgressKey } from '../config';
import { usePlayerProgress } from './usePlayerProgress';
import { isHardMode } from './progressMath';
import GameHub from './GameHub';
import LevelUpOverlay from './LevelUpOverlay';
import ReactionGame from './ReactionGame';
import MemoryGame from './MemoryGame';
import ColorTapGame from './ColorTapGame';
import StackTowerGame from './StackTowerGame';
import WordSprintGame from './WordSprintGame';
import './PulseArena.css';

const GAMES = {
    reaction: ReactionGame,
    memory: MemoryGame,
    color: ColorTapGame,
    stack: StackTowerGame,
    word: WordSprintGame
};

function SubjectArenaGate({ clientKey, activeGameId, onSelectGame, onBackToHub }) {
    const progress = usePlayerProgress(pulseProgressKey(clientKey));
    const [result, setResult] = useState(null);
    const [showLevelUp, setShowLevelUp] = useState(false);
    const hard = isHardMode(progress.level);

    const handleFinish = (rawScore) => {
        const award = progress.awardGame(activeGameId, rawScore);
        setResult(award);
        if (award.leveledUp) setShowLevelUp(true);
    };

    const closeResult = () => {
        setResult(null);
        setShowLevelUp(false);
        onBackToHub();
    };

    if (!activeGameId) {
        return <GameHub progress={progress} onSelectGame={onSelectGame} />;
    }

    const Game = GAMES[activeGameId];
    if (!Game) {
        onBackToHub();
        return null;
    }

    return (
        <div className="pulse-arena">
            <Game hard={hard} onFinish={handleFinish} onBack={onBackToHub} />
            {result && !showLevelUp && (
                <div className="pulse-result" role="dialog">
                    <div className="pulse-result__card">
                        <p>Oyun bitdi</p>
                        <p className="pulse-result__xp">+{result.gained} XP</p>
                        <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                            Level {result.newLevel}
                        </p>
                        <button type="button" className="pulse-result__btn" onClick={closeResult}>
                            Hub-a qayıt
                        </button>
                    </div>
                </div>
            )}
            {showLevelUp && (
                <LevelUpOverlay level={result?.newLevel} onDone={closeResult} />
            )}
        </div>
    );
}

export default SubjectArenaGate;
