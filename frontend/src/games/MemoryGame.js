import React, { useState, useEffect, useMemo, useRef } from 'react';
import GameShell from './GameShell';

const EMOJIS = ['🎯', '🔥', '⭐', '💎', '🎮', '🚀', '🌟', '⚡', '🎲', '🏆', '💫', '🎪'];

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function MemoryGame({ hard, onFinish, onBack }) {
    const pairCount = hard ? 8 : 6;
    const cards = useMemo(() => {
        const picked = EMOJIS.slice(0, pairCount);
        const pairs = shuffle([...picked, ...picked].map((emoji, i) => ({ id: i, emoji })));
        return pairs.map((c, idx) => ({ ...c, key: idx, faceUp: false, matched: false }));
    }, [pairCount]);

    const [deck, setDeck] = useState(cards);
    const [flipped, setFlipped] = useState([]);
    const [moves, setMoves] = useState(0);
    const [score, setScore] = useState(0);
    const [lock, setLock] = useState(false);

    const finishedRef = useRef(false);
    useEffect(() => {
        if (!deck.every((c) => c.matched) || finishedRef.current) return;
        finishedRef.current = true;
        const bonus = Math.max(50, 400 - moves * (hard ? 25 : 18));
        const t = setTimeout(() => onFinish(score + bonus), 500);
        return () => clearTimeout(t);
    }, [deck, moves, score, hard, onFinish]);

    const flip = (idx) => {
        if (lock || deck[idx].matched || deck[idx].faceUp) return;
        const next = deck.map((c, i) => (i === idx ? { ...c, faceUp: true } : c));
        setDeck(next);
        const newFlipped = [...flipped, idx];
        setFlipped(newFlipped);
        if (newFlipped.length === 2) {
            setLock(true);
            setMoves((m) => m + 1);
            const [a, b] = newFlipped;
            if (next[a].emoji === next[b].emoji) {
                setScore((s) => s + 40);
                setDeck((d) =>
                    d.map((c, i) =>
                        i === a || i === b ? { ...c, matched: true, faceUp: true } : c
                    )
                );
                setFlipped([]);
                setLock(false);
            } else {
                setTimeout(() => {
                    setDeck((d) =>
                        d.map((c, i) =>
                            i === a || i === b ? { ...c, faceUp: false } : c
                        )
                    );
                    setFlipped([]);
                    setLock(false);
                }, 700);
            }
        }
    };

    return (
        <GameShell title="Memory Match" score={score} onBack={onBack}>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>Cəhdlər: {moves}</p>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: hard ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)',
                    gap: '8px',
                    maxWidth: 320
                }}
            >
                {deck.map((c, idx) => (
                    <button
                        key={c.key}
                        type="button"
                        onClick={() => flip(idx)}
                        style={{
                            aspectRatio: '1',
                            fontSize: '1.5rem',
                            borderRadius: 10,
                            border: '2px solid #475569',
                            background: c.matched ? '#166534' : c.faceUp ? '#334155' : '#1e293b',
                            cursor: 'pointer',
                            minHeight: 48
                        }}
                    >
                        {c.faceUp || c.matched ? c.emoji : '?'}
                    </button>
                ))}
            </div>
        </GameShell>
    );
}

export default MemoryGame;
