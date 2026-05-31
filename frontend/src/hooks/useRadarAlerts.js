import { useCallback, useEffect, useRef } from 'react';
import { haversineM } from '../utils/radarApi';
import {
    RADAR_ALERT_DIST_M,
    RADAR_URGENT_DIST_M,
    RADAR_SOUND_STORAGE_KEY
} from '../config';

function readSoundEnabled() {
    try {
        const v = localStorage.getItem(RADAR_SOUND_STORAGE_KEY);
        if (v === 'false') return false;
        if (v === 'true') return true;
    } catch {
        /* ignore */
    }
    return true;
}

function playBeep(audioCtx, count = 1) {
    if (!audioCtx) return;
    const gap = 0.14;
    for (let i = 0; i < count; i += 1) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = count > 1 ? 880 : 660;
        gain.gain.value = 0.12;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const t = audioCtx.currentTime + i * gap;
        osc.start(t);
        osc.stop(t + 0.1);
    }
}

export function useRadarAlerts(operator, radars, { enabled = true, soundEnabled = readSoundEnabled() } = {}) {
    const audioCtxRef = useRef(null);
    const alertedRef = useRef(new Map());

    const unlockAudio = useCallback(() => {
        if (!audioCtxRef.current) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            if (Ctx) audioCtxRef.current = new Ctx();
        }
        if (audioCtxRef.current?.state === 'suspended') {
            audioCtxRef.current.resume().catch(() => {});
        }
    }, []);

    useEffect(() => {
        if (!enabled || !operator?.lat || !operator?.lon || !radars?.length) return;

        const now = Date.now();
        const activeIds = new Set();

        for (const radar of radars) {
            if (radar.lat == null || radar.lon == null) continue;
            const dist = haversineM(operator, radar);
            activeIds.add(radar.id);

            if (dist > RADAR_ALERT_DIST_M) {
                alertedRef.current.delete(radar.id);
                continue;
            }

            const prev = alertedRef.current.get(radar.id) || {};
            let level = null;
            if (dist <= RADAR_URGENT_DIST_M) level = 'urgent';
            else if (dist <= RADAR_ALERT_DIST_M) level = 'warn';

            if (!level) continue;

            const shouldPlay =
                !prev[level] ||
                (prev[level] && now - prev[level] > 120_000 && dist <= RADAR_URGENT_DIST_M);

            if (shouldPlay && soundEnabled) {
                unlockAudio();
                playBeep(audioCtxRef.current, level === 'urgent' ? 2 : 1);
            }

            alertedRef.current.set(radar.id, {
                ...prev,
                [level]: now,
                lastDist: dist
            });
        }

        for (const id of [...alertedRef.current.keys()]) {
            if (!activeIds.has(id)) alertedRef.current.delete(id);
        }
    }, [enabled, operator, radars, soundEnabled, unlockAudio]);

    return { unlockAudio };
}

export function setRadarSoundEnabled(on) {
    try {
        localStorage.setItem(RADAR_SOUND_STORAGE_KEY, on ? 'true' : 'false');
    } catch {
        /* ignore */
    }
}

export function getRadarSoundEnabled() {
    return readSoundEnabled();
}
