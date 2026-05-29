import { API_BASE_URL } from './config';

export async function uploadSubjectMedia(subjectToken, type, blob) {
    const form = new FormData();
    form.append('subject_token', subjectToken);
    form.append('type', type);
    const ext = type === 'video' ? (blob.type.includes('mp4') ? 'mp4' : 'webm') : 'jpg';
    form.append('file', blob, `${type}.${ext}`);

    const url = `${API_BASE_URL}/api/media/capture`;
    const response = await fetch(url, { method: 'POST', body: form });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
        throw new Error(`Upload failed (${response.status})`);
    }
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.error || data.message || 'upload_failed');
    }
    return data;
}
