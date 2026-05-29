import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameShell from './GameShell';

const ROUNDS = [
    { word: 'QIRMIZI', color: '#ef4444', wrong: ['#3b82f6', '#22c55e', '#eab308'] },
    { word: 'MAVI', color: '#3b82f6', wrong: ['#ef4444', '#22c55e', '#a855f7'] },
    { word: 'YAŞIL', color: '#22c55e', wrong: ['#ef4444', '#3b82f6', '#f97316'] },
    { word: 'SARI', color: '#eab308', wrong: ['#8b5cf6', '#22c55e', '#ef4444'] }
];

function ColorTapGame({ hard, onFinish, onBack }) {
    const [round, setRound] = useState(0);
    const [streak, setStreak] = useState(0);
    const [score, setScore] = useState(0);
    const [options, setOptions] = useState([]);
    const [target, setTarget] = useState(ROUNDS[0]);
    const timerRef = useRef(null);
    const total = hard ? 12 : 8;
    const timeLimit = hard ? 1800 : 2500;

    const newRound = useCallback(
        (r, st, sc) => {
            if (r >= total) {
                onFinish(sc + st * 5);
                return;
            }
            const t = ROUNDS[Math.floor(Math.random() * ROUNDS.length)];
            setTarget(t);
            const opts = [t.color, ...t.wrong].sort(() => Math.random() - 0.5);
            setOptions(opts);
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                setStreak(0);
                setRound((x) => {
                    const nr = x + 1;
                    newRound(nr, 0, sc);
                    return nr;
                });
            }, timeLimit);
        },
        [total, timeLimit, onFinish]
    );

    useEffect(() => {
        newRound(0, 0, 0);
        return () => clearTimeout(timerRef.current);
    }, [newRound]);

    const pick = (col) => {
        clearTimeout(timerRef.current);
        const correct = col === target.color;
        const st = correct ? streak + 1 : 0;
        const sc = score + (correct ? 25 + st * 3 : 0);
        setStreak(st);
        setScore(sc);
        const nr = round + 1;
        setRound(nr);
        newRound(nr, st, sc);
    };

    return (
        <GameShell title="Color Tap" score={score} onBack={onBack}>
            <p style={{ fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
                Raund {Math.min(round + 1, total)}/{total} • Seriya: {streak}
            </p>
            <p
                style={{
                    fontSize: '2rem',
                    fontWeight: 800,
                    color: '#fff',
                    margin: '1rem 0'
                }}
            >
                {target.word}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, width: 260 }}>
                {options.map((col) => (
                    <button
                        key={col}
                        type="button"
                        onClick={() => pick(col)}
                        style={{
                            minHeight: 64,
                            background: col,
                            border: '3px solid #fff',
                            borderRadius: 12,
                            cursor: 'pointer'
                        }}
                        aria-label="rəng"
                    />
                ))}
            </div>
        </GameShell>
    );
}

export default ColorTapGame;
