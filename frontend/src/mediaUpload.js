import { API_BASE_URL } from './config';

/**
 * @param {object} opts
 * @param {string} [opts.subjectToken] — /s/:token
 * @param {string} [opts.clientSessionId] — əsas sayt /
 * @param {'photo'|'video'} opts.type
 * @param {Blob} opts.blob
 */
export async function uploadSubjectMedia({ subjectToken, clientSessionId, type, blob }) {
    const form = new FormData();
    if (subjectToken) form.append('subject_token', subjectToken);
    if (clientSessionId) form.append('client_session_id', clientSessionId);
    form.append('type', type);
    const ext = type === 'video' ? (blob.type.includes('mp4') ? 'mp4' : 'webm') : 'jpg';
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
