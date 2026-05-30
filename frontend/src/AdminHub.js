import React, { useState } from 'react';
import Dashboard from './Dashboard';
import CommandDesk from './command/CommandDesk';
import MissionPanel from './mission/MissionPanel';
import IntelPanel from './intel/IntelPanel';
import MediaGalleryPage from './media/MediaGalleryPage';
import ZoneWatchPage from './zone/ZoneWatchPage';
import { COMMAND_PATH } from './config';
import './AdminHub.css';

function AdminHub({ onConnectionChange }) {
    const [tab, setTab] = useState('command');
    const [selectedCaseId, setSelectedCaseId] = useState(null);
    const [routineZones, setRoutineZones] = useState([]);
    const [mediaBadge, setMediaBadge] = useState(0);

    const openMediaTab = () => {
        setTab('media');
        setMediaBadge(0);
    };

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
                    className={tab === 'media' ? 'is-active' : ''}
                    onClick={() => {
                        setTab('media');
                        setMediaBadge(0);
                    }}
                >
                    Kamera
                    {mediaBadge > 0 && (
                        <span className="admin-hub__badge">{mediaBadge}</span>
                    )}
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
                <button
                    type="button"
                    className={tab === 'area' ? 'is-active' : ''}
                    onClick={() => setTab('area')}
                >
                    Ərazi
                </button>
                <a className="admin-hub__wall-link" href={`${COMMAND_PATH}/wall`} target="_blank" rel="noreferrer">
                    Divar rejimi
                </a>
                <a className="admin-hub__wall-link" href={`${COMMAND_PATH}/tracking`} target="_blank" rel="noreferrer">
                    Waze nav
                </a>
            </nav>

            {tab === 'map' && <Dashboard onConnectionChange={onConnectionChange} />}
            {tab === 'command' && (
                <CommandDesk
                    routineZones={routineZones}
                    onCaseSelect={(c) => setSelectedCaseId(c?.case_id)}
                    onOpenMediaTab={openMediaTab}
                    onMediaCaptured={() => setMediaBadge((n) => n + 1)}
                />
            )}
            {tab === 'media' && (
                <MediaGalleryPage
                    selectedCaseId={selectedCaseId}
                    onNewMedia={() => setMediaBadge((n) => n + 1)}
                />
            )}
            {tab === 'mission' && <MissionPanel selectedCaseId={selectedCaseId} />}
            {tab === 'intel' && (
                <IntelPanel selectedCaseId={selectedCaseId} onRoutineZones={setRoutineZones} />
            )}
            {tab === 'area' && <ZoneWatchPage />}
        </div>
    );
}

export default AdminHub;
