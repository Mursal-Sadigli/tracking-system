import React, { useState } from 'react';
import { apiPost } from '../api';

function ShareLinkButton({ caseId, disabled }) {
    const [lastUrl, setLastUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [minutes, setMinutes] = useState(60);

    const create = async () => {
        if (!caseId) return;
        setLoading(true);
        try {
            const data = await apiPost(
                `/api/cases/${caseId}/share`,
                {
                    expires_minutes: minutes,
                    frontend_base: window.location.origin
                },
                { admin: true }
            );
            setLastUrl(data.url || '');
        } catch (e) {
            alert(e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="share-link-btn">
            <label>
                Müvəqqəti izləmə (dəq)
                <input
                    type="number"
                    min={5}
                    max={1440}
                    value={minutes}
                    onChange={(e) => setMinutes(Number(e.target.value))}
                />
            </label>
            <button type="button" onClick={create} disabled={disabled || loading || !caseId}>
                {loading ? '...' : 'Paylaşım linki'}
            </button>
            {lastUrl && (
                <div className="share-link-btn__url">
                    <code>{lastUrl}</code>
                    <button type="button" onClick={() => navigator.clipboard?.writeText(lastUrl)}>
                        Kopyala
                    </button>
                </div>
            )}
        </div>
    );
}

export default ShareLinkButton;
