import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameShell from './GameShell';
const COLORS = { wait: '#475569', go: '#22c55e', stop: '#ef4444' };

function ReactionGame({ hard, onFinish, onBack }) {
    const [state, setState] = useState('ready');
    const [score, setScore] = useState(0);
    const [display, setDisplay] = useState('Başla');
    const [color, setColor] = useState(COLORS.wait);
    const startRef = useRef(0);
    const timeoutRef = useRef(null);
    const roundRef = useRef(0);
    const maxRounds = hard ? 8 : 5;

    const nextRound = useCallback(() => {
        if (roundRef.current >= maxRounds) {
            onFinish(score);
            return;
        }
        setState('wait');
        setDisplay('Gözlə...');
        setColor(COLORS.wait);
        const delay = 800 + Math.random() * (hard ? 1200 : 2000);
        timeoutRef.current = setTimeout(() => {
            startRef.current = Date.now();
            setState('go');
            setDisplay('TOXUN!');
            setColor(COLORS.go);
        }, delay);
    }, [hard, maxRounds, onFinish, score]);

    const start = () => {
        roundRef.current = 0;
        setScore(0);
        nextRound();
    };

    const tap = () => {
        if (state === 'ready') {
            start();
            return;
        }
        if (state === 'wait') {
            clearTimeout(timeoutRef.current);
            setState('fail');
            setDisplay('Tez oldun!');
            setColor(COLORS.stop);
            setTimeout(() => onFinish(Math.max(10, score)), 600);
            return;
        }
        if (state === 'go') {
            const ms = Date.now() - startRef.current;
            const pts = Math.max(20, 200 - Math.floor(ms / (hard ? 8 : 12)));
            roundRef.current += 1;
            setScore((s) => s + pts);
            setState('hit');
            setDisplay(`+${pts}`);
            setColor(COLORS.go);
            setTimeout(nextRound, 400);
        }
    };

    useEffect(() => () => clearTimeout(timeoutRef.current), []);

    return (
        <GameShell title="Reaction Rush" score={score} onBack={onBack}>
            <button
                type="button"
                onClick={tap}
                style={{
                    width: 'min(280px, 85vw)',
                    height: 'min(280px, 85vw)',
                    borderRadius: '50%',
                    border: 'none',
                    background: color,
                    color: '#fff',
                    fontSize: '1.5rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                }}
            >
                {display}
            </button>
        </GameShell>
    );
}

export default ReactionGame;
