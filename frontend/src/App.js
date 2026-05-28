import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import SubjectPage from './SubjectPage';
import SubjectSessionPage from './SubjectSessionPage';
import AdminPage from './AdminPage';
import WallMode from './command/WallMode';
import WatchPage from './WatchPage';
import { ADMIN_PATH, COMMAND_PATH } from './config';

function App() {
    const adminRoute = ADMIN_PATH.startsWith('/') ? ADMIN_PATH : `/${ADMIN_PATH}`;
    const commandWall = COMMAND_PATH.startsWith('/')
        ? `${COMMAND_PATH}/wall`
        : `/${COMMAND_PATH}/wall`;

    return (
        <Routes>
            <Route path="/" element={<SubjectPage />} />
            <Route path="/s/:token" element={<SubjectSessionPage />} />
            <Route path="/watch/:token" element={<WatchPage />} />
            <Route path={adminRoute} element={<AdminPage />} />
            <Route path={commandWall} element={<WallMode />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default App;
