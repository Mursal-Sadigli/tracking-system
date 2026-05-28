import React, { useState } from 'react';
import Dashboard from './Dashboard';
import CommandDesk from './command/CommandDesk';
import MissionPanel from './mission/MissionPanel';
import IntelPanel from './intel/IntelPanel';
import { COMMAND_PATH } from './config';
import './AdminHub.css';

function AdminHub({ onConnectionChange }) {
    const [tab, setTab] = useState('map');
    const [selectedCaseId, setSelectedCaseId] = useState(null);

    return (
        <div className="admin-hub">
            <nav className="admin-hub__tabs">
                <button
                    type="button"
                    className={tab === 'map' ? 'is-active' : ''}
                    onClick={() => setTab('map')}
                >
                    Xəritə
                </button>
                <button
                    type="button"
                    className={tab === 'command' ? 'is-active' : ''}
                    onClick={() => setTab('command')}
                >
                    Əməliyyat
                </button>
                <button
                    type="button"
                    className={tab === 'mission' ? 'is-active' : ''}
                    onClick={() => setTab('mission')}
                >
                    Missiya
                </button>
                <button
                    type="button"
                    className={tab === 'intel' ? 'is-active' : ''}
                    onClick={() => setTab('intel')}
                >
                    Analitika
                </button>
                <a className="admin-hub__wall-link" href={`${COMMAND_PATH}/wall`} target="_blank" rel="noreferrer">
                    Divar rejimi
                </a>
            </nav>

            {tab === 'map' && <Dashboard onConnectionChange={onConnectionChange} />}
            {tab === 'command' && (
                <CommandDesk onCaseSelect={(c) => setSelectedCaseId(c?.case_id)} />
            )}
            {tab === 'mission' && <MissionPanel selectedCaseId={selectedCaseId} />}
            {tab === 'intel' && <IntelPanel selectedCaseId={selectedCaseId} />}
        </div>
    );
}

export default AdminHub;
