import React, { useState, useEffect, useRef, useMemo } from 'react';
import GameShell from './GameShell';

const PUZZLES = [
    { q: 'İtirilmiş şəhər (AZ paytaxtı)', a: 'BAKI' },
    { q: 'Günəş sistemində 3-cü planet', a: 'YER' },
    { q: '2 + 2 = ?', a: '4' },
    { q: 'Qırmızı meyvə (ingilis: apple)', a: 'ALMA' },
    { q: 'Su donanda olur', a: 'BUZ' },
    { q: 'Gecə işığı', a: 'AY' },
    { q: '5 × 5', a: '25' },
    { q: 'Dənizin rəngi', a: 'MAVI' },
    { q: 'İldə neçə ay?', a: '12' },
    { q: 'Əlifbanın ilk hərfi', a: 'A' }
];

function normalize(s) {
    return String(s)
        .trim()
        .toUpperCase()
        .replace(/İ/g, 'I')
        .replace(/Ə/g, 'E')
        .replace(/Ş/g, 'S')
        .replace(/Ç/g, 'C')
        .replace(/Ö/g, 'O')
        .replace(/Ü/g, 'U')
        .replace(/Ğ/g, 'G');
}

function WordSprintGame({ hard, onFinish, onBack }) {
    const duration = hard ? 25 : 30;
    const [left, setLeft] = useState(duration);
    const [idx, setIdx] = useState(0);
    const [score, setScore] = useState(0);
    const [input, setInput] = useState('');
    const [done, setDone] = useState(false);
    const order = useMemo(
        () => [...PUZZLES].sort(() => Math.random() - 0.5).slice(0, hard ? 8 : 6),
        [hard]
    );
    const finishedRef = useRef(false);

    useEffect(() => {
        if (done) return undefined;
        const t = setInterval(() => {
            setLeft((l) => {
                if (l <= 1) {
                    setDone(true);
                    return 0;
                }
                return l - 1;
            });
        }, 1000);
        return () => clearInterval(t);
    }, [done]);

    useEffect(() => {
        if (done && !finishedRef.current) {
            finishedRef.current = true;
            onFinish(score + left * 2);
        }
    }, [done, score, left, onFinish]);

    const submit = (e) => {
        e.preventDefault();
        if (done) return;
        const cur = order[idx];
        if (normalize(input) === normalize(cur.a)) {
            setScore((s) => s + 45);
            const next = idx + 1;
            if (next >= order.length) {
                setDone(true);
            } else {
                setIdx(next);
            }
        }
        setInput('');
    };

    const cur = order[idx] || order[order.length - 1];

    return (
        <GameShell title="Word Sprint" score={score} onBack={onBack}>
            <p style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem' }}>{left}s</p>
            <p style={{ margin: '0 0 1rem', textAlign: 'center', maxWidth: 280 }}>{cur.q}</p>
            <form onSubmit={submit} style={{ width: '100%', maxWidth: 280 }}>
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    autoComplete="off"
                    autoCapitalize="characters"
                    placeholder="Cavab"
                    disabled={done}
                    style={{
                        width: '100%',
                        padding: '0.85rem',
                        fontSize: '1.1rem',
                        borderRadius: 10,
                        border: '2px solid #475569',
                        background: '#1e293b',
                        color: '#fff',
                        minHeight: 48
                    }}
                />
                <button
                    type="submit"
                    className="pulse-result__btn"
                    style={{ marginTop: '0.75rem' }}
                    disabled={done}
                >
                    Yoxla
                </button>
            </form>
        </GameShell>
    );
}

export default WordSprintGame;
