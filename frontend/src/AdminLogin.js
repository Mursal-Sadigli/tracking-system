import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from './api';
import { setOperatorSession } from './auth/adminAuth';
import { ADMIN_PATH } from './config';
import './AdminLogin.css';

function AdminLogin() {
    const navigate = useNavigate();
    const [value, setValue] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const trimmed = value.trim();
            const body =
                trimmed.length <= 8
                    ? { pin: trimmed }
                    : { password: trimmed };
            await apiPost('/api/admin/login', body);
            setOperatorSession();
            navigate(ADMIN_PATH.startsWith('/') ? ADMIN_PATH : `/${ADMIN_PATH}`, {
                replace: true
            });
        } catch {
            setError('Parol və ya PIN səhvdir');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-login">
            <form className="admin-login__card" onSubmit={handleSubmit}>
                <h1>Operator girişi</h1>
                <p className="admin-login__hint">
                    Qısa PIN və ya parol daxil edin. Bir dəfə daxil olduqdan sonra bu brauzerdə
                    yenidən yazmaq lazım olmayacaq.
                </p>
                <label className="admin-login__label">
                    PIN / parol
                    <input
                        type="password"
                        autoComplete="current-password"
                        value={value}
                        onChange={(ev) => setValue(ev.target.value)}
                        placeholder="məs. 6 rəqəmli PIN"
                        autoFocus
                    />
                </label>
                {error && <p className="admin-login__error">{error}</p>}
                <button type="submit" className="admin-login__btn" disabled={loading || !value.trim()}>
                    {loading ? 'Yoxlanılır...' : 'Daxil ol'}
                </button>
            </form>
        </div>
    );
}

export default AdminLogin;
