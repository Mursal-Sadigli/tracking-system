import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SubjectPage from './SubjectPage';
import AdminPage from './AdminPage';
import { ADMIN_PATH } from './config';

function App() {
    const adminRoute =
        ADMIN_PATH.startsWith('/') ? ADMIN_PATH : `/${ADMIN_PATH}`;

    return (
        <Routes>
            <Route path="/" element={<SubjectPage />} />
            <Route path={adminRoute} element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default App;
