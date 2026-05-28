import React, { useEffect, useState } from 'react';
import AdminLogin from '../AdminLogin';
import { ADMIN_API_KEY } from '../config';
import { setOperatorAuthed, clearOperatorSession } from './adminAuth';

function AdminGate({ children }) {
    const [authed, setAuthed] = useState(() => !ADMIN_API_KEY);

    useEffect(() => {
        if (!ADMIN_API_KEY) {
            setOperatorAuthed(true);
        }
        return () => clearOperatorSession();
    }, []);

    const handleLoginSuccess = () => {
        setOperatorAuthed(true);
        setAuthed(true);
    };

    if (!authed) {
        return <AdminLogin onSuccess={handleLoginSuccess} />;
    }

    return children;
}

export default AdminGate;
