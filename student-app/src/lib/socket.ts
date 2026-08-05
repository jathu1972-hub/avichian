import { io, type Socket } from 'socket.io-client';
import { getAccessToken, refreshAccessToken } from './api';
import { getSocketUrl } from './config';

let socket: Socket | null = null;
let lastToken: string | null = null;
let handlersBound = false;

type ConnListener = (connected: boolean) => void;
const connListeners = new Set<ConnListener>();

export function onSocketConnectionChange(fn: ConnListener): () => void {
  connListeners.add(fn);
  return () => connListeners.delete(fn);
}

function emitConn(connected: boolean) {
  connListeners.forEach((fn) => {
    try {
      fn(connected);
    } catch {
      /* ignore */
    }
  });
}

export function getSocket(): Socket | null {
  return socket;
}

function bindLifecycle(s: Socket) {
  if (handlersBound) return;
  handlersBound = true;

  s.on('connect', () => {
    console.info('[socket] connected', s.id);
    emitConn(true);
  });

  s.on('disconnect', (reason) => {
    console.warn('[socket] disconnected', reason);
    emitConn(false);
    // Socket.IO auto-reconnects for most reasons; force reconnect if server kicked us
    if (reason === 'io server disconnect') {
      s.connect();
    }
  });

  s.on('connect_error', (err) => {
    console.warn('[socket] connect_error', err.message);
    emitConn(false);
  });

  s.io.on('reconnect_attempt', (n) => {
    console.info('[socket] reconnect_attempt', n);
    // Keep auth fresh on reconnect
    const token = getAccessToken();
    s.auth = { token };
    lastToken = token;
  });

  s.io.on('reconnect', (n) => {
    console.info('[socket] reconnected', n);
    emitConn(true);
  });

  s.io.on('reconnect_failed', () => {
    console.error('[socket] reconnect_failed — will keep trying via new connect()');
    // Don't give up forever: try again after delay
    window.setTimeout(() => {
      if (!s.connected) {
        void refreshAccessToken().finally(() => {
          s.auth = { token: getAccessToken() };
          s.connect();
        });
      }
    }, 5000);
  });
}

/**
 * Connect (or reconnect) Socket.IO with the current JWT.
 * Dev: same origin → Vite proxy. Prod: API origin from config.
 * Auto-reconnect is always enabled.
 */
export function connectSocket(): Socket {
  const token = getAccessToken();
  const url = getSocketUrl();

  if (socket && lastToken === token && socket.connected) {
    return socket;
  }

  // Token refresh: update auth only — do NOT removeAllListeners
  if (socket && lastToken !== token) {
    socket.auth = { token };
    lastToken = token;
    if (!socket.connected) {
      socket.connect();
    } else {
      socket.disconnect();
      socket.connect();
    }
    return socket;
  }

  if (socket && !socket.connected) {
    socket.auth = { token };
    lastToken = token;
    socket.connect();
    return socket;
  }

  lastToken = token;
  socket = io(url ?? window.location.origin, {
    path: '/socket.io',
    auth: { token },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 8000,
    randomizationFactor: 0.4,
    timeout: 20000,
  });

  handlersBound = false;
  bindLifecycle(socket);

  return socket;
}

/** Wait until socket is connected (call invite / WebRTC signaling). */
export function whenSocketConnected(timeoutMs = 12000): Promise<Socket> {
  const s = connectSocket();
  if (s.connected) return Promise.resolve(s);
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => {
      s.off('connect', onConnect);
      reject(
        new Error(
          'Realtime connection timed out. Chat and calls need Socket.IO — check that the API is online.',
        ),
      );
    }, timeoutMs);
    function onConnect() {
      window.clearTimeout(t);
      resolve(s);
    }
    s.once('connect', onConnect);
  });
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.io.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  handlersBound = false;
  lastToken = null;
  emitConn(false);
}

export function joinConversation(conversationId: string) {
  const s = connectSocket();
  s.emit('joinConversation', conversationId);
  s.emit('chat:join', conversationId);
}

export function leaveConversation(conversationId: string) {
  const s = getSocket();
  s?.emit('leaveConversation', conversationId);
  s?.emit('chat:leave', conversationId);
}

export function emitTyping(conversationId: string, typing: boolean) {
  const s = connectSocket();
  s.emit('chat:typing', { conversationId, typing });
  s.emit('typing', { conversationId, typing });
}

export function markChatSeen(conversationId: string) {
  const s = connectSocket();
  s.emit('messageSeen', { conversationId });
  s.emit('chat:read', { conversationId });
}
