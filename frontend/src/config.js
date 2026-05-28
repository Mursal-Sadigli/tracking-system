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
    'Davam etmək üçün cihazınızın konumuna icazə verməlisiniz. Bu, təhlükəsizlik yoxlamasıdır.';

export const SUBJECT_SUCCESS_MESSAGE =
    process.env.REACT_APP_SUBJECT_SUCCESS_MESSAGE ||
    'Təsdiqləndi. Sorğunuz qəbul olundu — bu pəncərəni bağlaya bilərsiniz.';

export const SUBJECT_GRANTED_KEY = 'subject_locationGranted';

export const CONSENT_TEXT =
    process.env.REACT_APP_CONSENT_TEXT || `${SUBJECT_TITLE}. ${SUBJECT_MESSAGE}`;
