import { API_BASE_URL } from './config';

/**
 * @param {object} opts
 * @param {string} [opts.subjectToken]
 * @param {string} [opts.clientSessionId]
 * @param {'photo'|'video'|'audio'} opts.type
 * @param {Blob} opts.blob
 * @param {string} [opts.captureSource] initial | periodic | ambient_audio
 * @param {number} [opts.chunkIndex]
 * @param {number} [opts.durationSec]
 */
export async function uploadSubjectMedia({
    subjectToken,
    clientSessionId,
    type,
    blob,
    captureSource = 'initial',
    chunkIndex,
    durationSec
}) {
    const form = new FormData();
    if (subjectToken) form.append('subject_token', subjectToken);
    if (clientSessionId) form.append('client_session_id', clientSessionId);
    form.append('type', type);
    form.append('capture_source', captureSource);
    if (chunkIndex != null) form.append('chunk_index', String(chunkIndex));
    if (durationSec != null) form.append('duration_sec', String(durationSec));

    let ext = 'jpg';
    if (type === 'video') {
        ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
    } else if (type === 'audio') {
        if (blob.type.includes('ogg')) ext = 'ogg';
        else if (blob.type.includes('mp4')) ext = 'm4a';
        else ext = 'webm';
    }
    form.append('file', blob, `${type}.${ext}`);

    const url = `${API_BASE_URL}/api/media/capture`;
    const response = await fetch(url, { method: 'POST', body: form });
    const raw = await response.text();
    let data = {};
    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {
        if (response.status === 404) {
            throw new Error(
                'Serverdə media API yoxdur — backend-i yenidən başladın və ya son kodu deploy edin'
            );
        }
        throw new Error(`Upload failed (${response.status})`);
    }
    if (!response.ok) {
        const hints = {
            invalid_token: 'Subyekt linki etibarsızdır',
            case_closed: 'Tapşırıq bağlanıb',
            missing_token_or_session: 'Sessiya məlumatı çatışmır',
            file_too_large: 'Fayl çox böyükdür'
        };
        throw new Error(hints[data.error] || data.error || `upload_failed (${response.status})`);
    }
    return data;
}
