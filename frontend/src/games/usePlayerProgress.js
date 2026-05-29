import { useCallback, useMemo, useState } from 'react';
import { computeAward, levelFromXp, xpToNextLevel, GAME_DEFS, isGameUnlocked } from './progressMath';

function loadState(storageKey) {
    try {
        const raw = localStorage.getItem(storageKey);
        if (raw) return JSON.parse(raw);
    } catch {
        /* ignore */
    }
    return { xp: 0, gamesPlayed: {}, bestScores: {} };
}

function saveState(storageKey, state) {
    try {
        localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
        /* ignore */
    }
}

export function usePlayerProgress(storageKey) {
    const [state, setState] = useState(() => loadState(storageKey));

    const level = levelFromXp(state.xp);
    const xpInfo = xpToNextLevel(state.xp);

    const unlockedGames = useMemo(
        () => GAME_DEFS.map((g) => ({ ...g, unlocked: isGameUnlocked(g.id, level) })),
        [level]
    );

    const awardGame = useCallback(
        (gameId, rawScore) => {
            const result = computeAward(state.xp, rawScore, gameId);
            setState((prev) => {
                const next = {
                    xp: result.xp,
                    gamesPlayed: {
                        ...prev.gamesPlayed,
                        [gameId]: (prev.gamesPlayed[gameId] || 0) + 1
                    },
                    bestScores: {
                        ...prev.bestScores,
                        [gameId]: Math.max(prev.bestScores[gameId] || 0, rawScore)
                    }
                };
                saveState(storageKey, next);
                return next;
            });
            return result;
        },
        [state.xp, storageKey]
    );

    return {
        xp: state.xp,
        level,
        xpInfo,
        unlockedGames,
        gamesPlayed: state.gamesPlayed,
        bestScores: state.bestScores,
        awardGame
    };
}
