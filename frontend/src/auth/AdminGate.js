import React, { useEffect, useState } from 'react';
import AdminLogin from '../AdminLogin';
import { ADMIN_API_KEY } from '../config';
import {
    isOperatorLoggedIn,
    setOperatorSession,
    consumeUrlKey,
    getStoredUrlKey,
    clearStoredUrlKey
} from './adminAuth';
import { apiPost } from '../api';

function AdminGate({ children }) {
    const [ready, setReady] = useState(false);
    const [authed, setAuthed] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const run = async () => {
            if (isOperatorLoggedIn()) {
                if (!cancelled) {
                    setAuthed(true);
                    setReady(true);
                }
                return;
            }

            if (consumeUrlKey()) {
                const key = getStoredUrlKey();
                try {
                    await apiPost('/api/admin/login', { password: key });
                    clearStoredUrlKey();
                    setOperatorSession();
                    if (!cancelled) {
                        setAuthed(true);
                        setReady(true);
                    }
                    return;
                } catch {
                    clearStoredUrlKey();
                }
            }

            if (!ADMIN_API_KEY) {
                setOperatorSession();
                if (!cancelled) {
                    setAuthed(true);
                    setReady(true);
                }
                return;
            }

            if (!cancelled) {
                setAuthed(false);
                setReady(true);
            }
        };

        run();
        return () => {
            cancelled = true;
        };
    }, []);

    if (!ready) {
        return (
            <div className="admin-login">
                <p style={{ color: '#e2e8f0', textAlign: 'center' }}>Yüklənir...</p>
            </div>
        );
    }

    if (!authed) {
        return <AdminLogin />;
    }

    return children;
}

export default AdminGate;
