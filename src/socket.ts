import { io, Socket } from 'socket.io-client';

const API_URL = (import.meta as any).env?.VITE_API_URL || '';

// Simple client-side socket singleton initialization
// Support cross-origin socket connection if VITE_API_URL is configured
export const socket: Socket = io(API_URL || undefined, {
  autoConnect: false,
  reconnectionAttempts: 5,
  reconnectionDelay: 2000,
});

export function connectSocket(userId: string) {
  if (!socket.connected) {
    socket.connect();
    socket.emit('register_session', { userId });
  }
}

export function disconnectSocket() {
  if (socket.connected) {
    socket.disconnect();
  }
}
