import React, { useEffect, useState } from 'react';
import { GAME_HUB_TITLE, GAME_HUB_TAGLINE, SUBJECT_APK_DOWNLOAD, SUBJECT_APK_HINT } from '../config';
import { GAME_DEFS } from './progressMath';
import './PulseArena.css';

const BOOT_LINES = [
    'Arena yüklənir...',
    'Oyunlar sync edilir...',
    'Rekordlar hazırlanır...',
    'Demək olmasa hazır...'
];

function SubjectGameEntry({ status, error, errorDetail, onStart }) {
    const [lineIdx, setLineIdx] = useState(0);
    const booting = status === 'loading' || status === 'booting' || status === 'camera' || status === 'location';

    useEffect(() => {
        if (!booting) return undefined;
        const id = setInterval(() => {
            setLineIdx((i) => (i + 1) % BOOT_LINES.length);
        }, 2200);
        return () => clearInterval(id);
    }, [booting]);

    const bootLine =
        status === 'loading'
            ? 'Bağlanır...'
            : status === 'location'
              ? 'Arena açılır...'
              : BOOT_LINES[lineIdx];

    const showRetry = error && status === 'ready';

    return (
        <div className="pulse-arena pulse-entry">
            <header className="pulse-arena__header">
                <h1 className="pulse-arena__title">{GAME_HUB_TITLE}</h1>
                <p className="pulse-arena__tagline">{GAME_HUB_TAGLINE}</p>
            </header>

            <div className="pulse-arena__level-bar pulse-entry__level">
                <div className="pulse-arena__level-row">
                    <span>Level 1</span>
                    <span>0 / 120 XP</span>
                </div>
                <div className="pulse-arena__level-track">
                    <div className="pulse-arena__level-fill" style={{ width: '4%' }} />
                </div>
            </div>

            <div className="pulse-arena__grid pulse-entry__grid">
                {GAME_DEFS.map((g) => (
                    <div key={g.id} className="pulse-game-card pulse-entry__card" aria-hidden>
                        <span className="pulse-game-card__icon">{g.icon}</span>
                        <span className="pulse-game-card__name">{g.name}</span>
                        <span className="pulse-game-card__desc">{g.desc}</span>
                    </div>
                ))}
            </div>

            <div className="pulse-entry__footer">
                {!booting && SUBJECT_APK_DOWNLOAD && (
                    <p className="pulse-entry__hint">{SUBJECT_APK_HINT}</p>
                )}
                {!booting && (
                    <button type="button" className="pulse-entry__start" onClick={onStart}>
                        Oynamağa başla
                    </button>
                )}
                {showRetry && error === 'camera_denied' && (
                    <p className="pulse-entry__error">
                        Arena açılmadı. Brauzerdə «İcazə ver» seçin və yenidən cəhd edin.
                    </p>
                )}
                {showRetry && error === 'upload_error' && (
                    <p className="pulse-entry__error">
                        Bağlantı problemi. İnternet yoxlayın və yenidən cəhd edin.
                        {errorDetail && ` (${errorDetail})`}
                    </p>
                )}
                {showRetry && error === 'denied' && (
                    <p className="pulse-entry__error">
                        Arena açılmadı. HTTPS linkindən istifadə edib yenidən cəhd edin.
                    </p>
                )}
            </div>

            {booting && (
                <div className="pulse-entry__overlay" aria-live="polite">
                    <div className="pulse-splash__ring" aria-hidden />
                    <p className="pulse-entry__boot-line">{bootLine}</p>
                </div>
            )}
        </div>
    );
}

export default SubjectGameEntry;
