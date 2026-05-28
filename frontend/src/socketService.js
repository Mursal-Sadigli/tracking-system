import io from 'socket.io-client';
import { SOCKET_URL } from './config';

let socketInstance = null;
let connectionCount = 0;

export function getTrackingSocket() {
    if (!socketInstance || socketInstance.disconnected) {
        socketInstance = io(SOCKET_URL, {
            path: '/socket.io',
            transports: ['polling', 'websocket'],
            upgrade: true,
            autoConnect: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: 20000
        });
    }
    connectionCount += 1;
    return socketInstance;
}

export function releaseTrackingSocket() {
    connectionCount = Math.max(0, connectionCount - 1);
    if (connectionCount === 0 && socketInstance) {
        socketInstance.disconnect();
        socketInstance = null;
    }
}

export function isSocketConnected() {
    return Boolean(socketInstance?.connected);
}
