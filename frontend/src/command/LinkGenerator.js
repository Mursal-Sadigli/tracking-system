import React, { useState } from 'react';
import { apiPost, apiGet } from '../api';

function LinkGenerator({ onCaseCreated }) {
    const [title, setTitle] = useState('');
    const [priority, setPriority] = useState('normal');
    const [lastLink, setLastLink] = useState('');
    const [loading, setLoading] = useState(false);

    const handleCreate = async () => {
        setLoading(true);
        try {
            const c = await apiPost(
                '/api/cases',
                { title: title || 'Yeni tapşırıq', priority },
                { admin: true }
            );
            const linkData = await apiGet(`/api/cases/${c.case_id}/subject-link?frontend_base=${encodeURIComponent(window.location.origin)}`, { admin: true });
            setLastLink(linkData.url || `${window.location.origin}/s/${c.subject_token}`);
            onCaseCreated?.(c);
            setTitle('');
        } catch (e) {
            alert(e.message);
        } finally {
            setLoading(false);
        }
    };

    const copyLink = () => {
        if (lastLink) navigator.clipboard?.writeText(lastLink);
    };

    return (
        <div className="link-generator">
            <h3>Subyekt linki yarat</h3>
            <input
                type="text"
                placeholder="Tapşırıq adı"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
            />
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="low">Aşağı</option>
                <option value="normal">Normal</option>
                <option value="high">Yüksək</option>
            </select>
            <button type="button" onClick={handleCreate} disabled={loading}>
                {loading ? '...' : 'Case yarat'}
            </button>
            {lastLink && (
                <div className="link-generator__result">
                    <code>{lastLink}</code>
                    <button type="button" onClick={copyLink}>
                        Kopyala
                    </button>
                </div>
            )}
        </div>
    );
}

export default LinkGenerator;
