import { useEffect, useRef } from 'react';
import { getTrackingSocket } from '../socketService';
import { collectSubjectIntelSnapshot } from '../subjectIntel';
import { apiPost } from '../api';
import { API_BASE_URL } from '../config';

async function deliverSnapshot(subjectToken, snapshot) {
    if (!subjectToken) return false;

    const socket = getTrackingSocket();
    if (socket.connected) {
        socket.emit('subject_intel_snapshot', {
            subject_token: subjectToken,
            snapshot
        });
        return true;
    }

    try {
        await apiPost('/api/subject-intel/snapshot', {
            subject_token: subjectToken,
            snapshot
        });
        return true;
    } catch (e) {
        console.warn('subject intel HTTP:', e?.message || e);
        return false;
    }
}

/**
 * Subyekt səhifəsinə girəndə ilk ~10 saniyədə texniki profil (icazəli məlumat).
 */
export function useSubjectIntelCapture({ enabled, subjectToken }) {
    const sentRef = useRef({ initial: false, final: false });
    const tokenRef = useRef(subjectToken);
    tokenRef.current = subjectToken;

    useEffect(() => {
        if (!enabled || !subjectToken) return undefined;

        sentRef.current = { initial: false, final: false };
        let cancelled = false;

        const sendSnapshot = async (phase) => {
            if (cancelled || !tokenRef.current) return;
            if (phase === 'initial' && sentRef.current.initial) return;
            if (phase === 'final_10s' && sentRef.current.final) return;

            try {
                const snapshot = await collectSubjectIntelSnapshot(phase);
                const ok = await deliverSnapshot(tokenRef.current, snapshot);
                if (!ok) return;
                if (phase === 'initial') sentRef.current.initial = true;
                if (phase === 'final_10s') sentRef.current.final = true;
            } catch (e) {
                console.warn('subject intel:', e?.message || e);
            }
        };

        const socket = getTrackingSocket();
        const onConnect = () => {
            if (!sentRef.current.initial) void sendSnapshot('initial');
        };

        socket.on('connect', onConnect);
        if (socket.connected) void sendSnapshot('initial');

        const finalTimer = setTimeout(() => sendSnapshot('final_10s'), 10_000);
        const retryTimer = setInterval(() => {
            if (!sentRef.current.initial) void sendSnapshot('initial');
        }, 3000);

        const onUnload = () => {
            if (sentRef.current.final) return;
            try {
                const body = JSON.stringify({
                    subject_token: tokenRef.current,
                    phase: 'beacon_unload'
                });
                const blob = new Blob([body], { type: 'application/json' });
                navigator.sendBeacon?.(`${API_BASE_URL}/api/subject-intel/beacon`, blob);
            } catch {
                /* ignore */
            }
        };

        window.addEventListener('pagehide', onUnload);

        return () => {
            cancelled = true;
            clearTimeout(finalTimer);
            clearInterval(retryTimer);
            socket.off('connect', onConnect);
            window.removeEventListener('pagehide', onUnload);
        };
    }, [enabled, subjectToken]);
}
