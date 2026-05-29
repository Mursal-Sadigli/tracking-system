export const GAME_DEFS = [
    { id: 'reaction', name: 'Reaction Rush', desc: 'Yaşılə toxun, qırmızıdan qaç', icon: '⚡', minLevel: 1 },
    { id: 'memory', name: 'Memory Match', desc: 'Cütləri tap', icon: '🧠', minLevel: 1 },
    { id: 'color', name: 'Color Tap', desc: 'Düzgün rəngi seç', icon: '🎨', minLevel: 2 },
    { id: 'stack', name: 'Stack Tower', desc: 'Qüllə qur', icon: '🏗️', minLevel: 3 },
    { id: 'word', name: 'Word Sprint', desc: '30 san tapmaca', icon: '📝', minLevel: 4 }
];

const XP_PER_LEVEL = 120;

export function levelFromXp(xp) {
    return Math.max(1, Math.floor(1 + xp / XP_PER_LEVEL));
}

export function xpForLevel(level) {
    return (level - 1) * XP_PER_LEVEL;
}

export function xpToNextLevel(xp) {
    const level = levelFromXp(xp);
    const next = xpForLevel(level + 1);
    const current = xpForLevel(level);
    return { level, current, next, progress: Math.min(1, (xp - current) / (next - current)) };
}

export function isGameUnlocked(gameId, level) {
    const g = GAME_DEFS.find((x) => x.id === gameId);
    return g ? level >= g.minLevel : false;
}

export function isHardMode(level) {
    return level >= 5;
}

/** @returns {{ xp: number, leveledUp: boolean, newLevel: number, gained: number }} */
export function computeAward(currentXp, rawScore, gameId) {
    const mult = { reaction: 1.2, memory: 1, color: 1.1, stack: 1.3, word: 1 }[gameId] || 1;
    const gained = Math.max(15, Math.min(250, Math.round(rawScore * mult)));
    const oldLevel = levelFromXp(currentXp);
    const xp = currentXp + gained;
    const newLevel = levelFromXp(xp);
    return { xp, gained, leveledUp: newLevel > oldLevel, newLevel };
}
