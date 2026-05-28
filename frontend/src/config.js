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
