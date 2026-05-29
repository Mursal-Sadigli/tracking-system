import React, { useRef, useEffect, useState, useCallback } from 'react';
import GameShell from './GameShell';

const W = 280;
const H = 400;
const BLOCK_H = 24;

function StackTowerGame({ hard, onFinish, onBack }) {
    const canvasRef = useRef(null);
    const animRef = useRef(null);
    const [score, setScore] = useState(0);
    const [running, setRunning] = useState(false);
    const stateRef = useRef({
        stack: [],
        moving: null,
        dir: 1,
        speed: hard ? 3.2 : 2.2,
        gameOver: false
    });

    const draw = useCallback((ctx, st) => {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, W, H);
        st.stack.forEach((b, i) => {
            ctx.fillStyle = `hsl(${220 + i * 8}, 70%, 55%)`;
            ctx.fillRect(b.x, H - (i + 1) * BLOCK_H - 40, b.w, BLOCK_H);
        });
        if (st.moving && !st.gameOver) {
            ctx.fillStyle = '#22d3ee';
            ctx.fillRect(st.moving.x, 60, st.moving.w, BLOCK_H);
        }
    }, []);

    const onFinishRef = useRef(onFinish);
    onFinishRef.current = onFinish;

    const loop = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const st = stateRef.current;
        if (!st.gameOver && st.moving) {
            st.moving.x += st.dir * st.speed;
            const top = st.stack[st.stack.length - 1];
            const maxX = W - st.moving.w;
            if (st.moving.x <= 0 || st.moving.x >= maxX) st.dir *= -1;
            if (top && Math.abs(st.moving.x - top.x) > top.w) {
                st.gameOver = true;
                setRunning(false);
                const finalScore = st.stack.length * 35;
                setScore(finalScore);
                setTimeout(() => onFinishRef.current(finalScore), 400);
            }
        }
        draw(ctx, st);
        animRef.current = requestAnimationFrame(loop);
    }, [draw]);

    const startGame = useCallback(() => {
        const baseW = hard ? 100 : 120;
        stateRef.current = {
            stack: [{ x: (W - baseW) / 2, w: baseW }],
            moving: { x: 0, w: baseW },
            dir: 1,
            speed: hard ? 3.2 : 2.2,
            gameOver: false
        };
        setScore(0);
        setRunning(true);
    }, [hard]);

    const stopBlock = () => {
        const st = stateRef.current;
        if (!running || st.gameOver || !st.moving) return;
        const top = st.stack[st.stack.length - 1];
        const overlap =
            Math.min(top.x + top.w, st.moving.x + st.moving.w) - Math.max(top.x, st.moving.x);
        if (overlap <= 8) {
            st.gameOver = true;
            setRunning(false);
            const finalScore = st.stack.length * 35;
            setScore(finalScore);
                setTimeout(() => onFinishRef.current(finalScore), 400);
            return;
        }
        const newX = Math.max(top.x, st.moving.x);
        const newW = overlap;
        st.stack.push({ x: newX, w: newW });
        const newScore = st.stack.length * 35;
        setScore(newScore);
        if (st.stack.length >= (hard ? 14 : 10)) {
            st.gameOver = true;
            setRunning(false);
            setTimeout(() => onFinishRef.current(newScore), 400);
            return;
        }
        st.moving = { x: 0, w: newW };
        st.speed += hard ? 0.15 : 0.1;
    };

    useEffect(() => {
        startGame();
        animRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- oyun yalnız mount / hard dəyişəndə başlayır
    }, [hard]);

    return (
        <GameShell title="Stack Tower" score={score} onBack={onBack}>
            <canvas
                ref={canvasRef}
                width={W}
                height={H}
                style={{ maxWidth: '100%', borderRadius: 12, touchAction: 'none' }}
                onClick={stopBlock}
                onTouchEnd={(e) => {
                    e.preventDefault();
                    stopBlock();
                }}
            />
            <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Bloku dayandırmaq üçün toxun</p>
        </GameShell>
    );
}

export default StackTowerGame;
