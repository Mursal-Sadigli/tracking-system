import React, { useState } from 'react';
import { apiPost } from './api';
import './AdminLogin.css';

function AdminLogin({ onSuccess }) {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handlePinChange = (ev) => {
        const digits = ev.target.value.replace(/\D/g, '').slice(0, 6);
        setPin(digits);
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (pin.length !== 6) {
            setError('6 rəqəmli PIN daxil edin');
            return;
        }
        setError('');
        setLoading(true);
        try {
            await apiPost('/api/admin/login', { pin });
            onSuccess();
        } catch {
            setError('PIN səhvdir');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-login">
            <form className="admin-login__card" onSubmit={handleSubmit}>
                <h1>Operator girişi</h1>
                <p className="admin-login__hint">Hər dəfə 6 rəqəmli PIN daxil edin.</p>
                <label className="admin-login__label">
                    PIN
                    <input
                        type="password"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={6}
                        value={pin}
                        onChange={handlePinChange}
                        placeholder="••••••"
                        autoFocus
                    />
                </label>
                {error && <p className="admin-login__error">{error}</p>}
                <button type="submit" className="admin-login__btn" disabled={loading || pin.length !== 6}>
                    {loading ? 'Yoxlanılır...' : 'Daxil ol'}
                </button>
            </form>
        </div>
    );
}

export default AdminLogin;
