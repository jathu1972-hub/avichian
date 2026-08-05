import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import {
  isConversationMember,
  markConversationRead,
  markMessagesDelivered,
  sendMessage,
} from './services/chat.service.js';
import { prisma } from './lib/prisma.js';

interface SocketUser {
  id: string;
  regNo: string;
  role: string;
}

/** Track multi-tab connections so we only mark offline when last socket leaves. */
const connectionCounts = new Map<string, number>();

let ioInstance: Server | null = null;

export function emitToUser(userId: string, event: string, payload: unknown) {
  ioInstance?.to(`user:${userId}`).emit(event, payload);
}

export function emitChatEvent(conversationId: string, event: string, payload: unknown) {
  ioInstance?.to(`conversation:${conversationId}`).emit(event, payload);
}

export function getIo(): Server | null {
  return ioInstance;
}

export function attachSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.frontendUrls.length ? env.frontendUrls : true,
      credentials: true,
    },
    path: '/socket.io',
    pingInterval: 20000,
    pingTimeout: 25000,
  });

  io.use((socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        (socket.handshake.query?.token as string | undefined);
      if (!token) {
        next(new Error('Unauthorized'));
        return;
      }
      const payload = jwt.verify(token, env.jwtAccessSecret) as {
        sub: string;
        regNo: string;
        role: string;
      };
      (socket.data as { user: SocketUser }).user = {
        id: payload.sub,
        regNo: payload.regNo,
        role: payload.role,
      };
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  ioInstance = io;

  io.on('connection', async (socket) => {
    const user = (socket.data as { user: SocketUser }).user;
    socket.join(`user:${user.id}`);

    const prev = connectionCounts.get(user.id) ?? 0;
    connectionCounts.set(user.id, prev + 1);

    await prisma.user.update({
      where: { id: user.id },
      data: { online: true, lastSeen: new Date() },
    });
    io.emit('presence:update', { userId: user.id, online: true, lastSeen: new Date().toISOString() });
    io.emit('userOnline', { userId: user.id });

    socket.on('joinConversation', async (conversationId: string, ack?: (r: unknown) => void) => {
      try {
        if (!conversationId || typeof conversationId !== 'string') {
          ack?.({ ok: false, error: 'Invalid conversation' });
          return;
        }
        const allowed = await isConversationMember(user.id, conversationId);
        if (!allowed) {
          ack?.({ ok: false, error: 'Not a member' });
          return;
        }
        socket.join(`conversation:${conversationId}`);
        const delivered = await markMessagesDelivered(user.id, conversationId);
        for (const peerId of delivered.peerIds) {
          emitToUser(peerId, 'chat:message:delivered', {
            conversationId,
            deliveredAt: delivered.deliveredAt,
            readerId: user.id,
          });
          emitToUser(peerId, 'messageDelivered', {
            conversationId,
            deliveredAt: delivered.deliveredAt,
          });
        }
        ack?.({ ok: true });
      } catch (error) {
        ack?.({ ok: false, error: error instanceof Error ? error.message : 'Failed' });
      }
    });

    // Back-compat alias
    socket.on('chat:join', (conversationId: string) => {
      void (async () => {
        if (!(await isConversationMember(user.id, conversationId))) return;
        socket.join(`conversation:${conversationId}`);
        const delivered = await markMessagesDelivered(user.id, conversationId);
        for (const peerId of delivered.peerIds) {
          emitToUser(peerId, 'chat:message:delivered', {
            conversationId,
            deliveredAt: delivered.deliveredAt,
            readerId: user.id,
          });
        }
      })();
    });

    socket.on('leaveConversation', (conversationId: string) => {
      if (typeof conversationId === 'string') {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    socket.on('chat:leave', (conversationId: string) => {
      if (typeof conversationId === 'string') {
        socket.leave(`conversation:${conversationId}`);
      }
    });

    socket.on(
      'typing',
      async (payload: { conversationId: string; typing: boolean }, ack?: (r: unknown) => void) => {
        try {
          if (!payload?.conversationId) return;
          if (!(await isConversationMember(user.id, payload.conversationId))) return;
          const typing = Boolean(payload.typing);
          socket.to(`conversation:${payload.conversationId}`).emit('typing', {
            conversationId: payload.conversationId,
            userId: user.id,
            typing,
          });
          socket.to(`conversation:${payload.conversationId}`).emit('chat:typing', {
            conversationId: payload.conversationId,
            userId: user.id,
            typing,
          });
          if (!typing) {
            socket.to(`conversation:${payload.conversationId}`).emit('stopTyping', {
              conversationId: payload.conversationId,
              userId: user.id,
            });
          }
          ack?.({ ok: true });
        } catch {
          ack?.({ ok: false });
        }
      },
    );

    socket.on('chat:typing', async (payload: { conversationId: string; typing: boolean }) => {
      if (!payload?.conversationId) return;
      if (!(await isConversationMember(user.id, payload.conversationId))) return;
      socket.to(`conversation:${payload.conversationId}`).emit('chat:typing', {
        conversationId: payload.conversationId,
        userId: user.id,
        typing: Boolean(payload.typing),
      });
      socket.to(`conversation:${payload.conversationId}`).emit('typing', {
        conversationId: payload.conversationId,
        userId: user.id,
        typing: Boolean(payload.typing),
      });
    });

    socket.on(
      'sendMessage',
      async (
        payload: {
          conversationId: string;
          body?: string;
          type?: string;
          mediaUrl?: string;
          fileName?: string;
          replyToId?: string;
        },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const message = await sendMessage(user.id, payload.conversationId, {
            body: payload.body,
            type: (payload.type as 'TEXT') ?? 'TEXT',
            mediaUrl: payload.mediaUrl,
            fileName: payload.fileName,
            replyToId: payload.replyToId,
          });
          const { peerIds, ...publicMsg } = message;
          io.to(`conversation:${payload.conversationId}`).emit('chat:message', publicMsg);
          io.to(`conversation:${payload.conversationId}`).emit('receiveMessage', publicMsg);
          for (const peerId of peerIds) {
            io.to(`user:${peerId}`).emit('chat:notify', publicMsg);
            io.to(`user:${peerId}`).emit('chat:message', publicMsg);
          }
          ack?.({ ok: true, message: publicMsg });
        } catch (error) {
          ack?.({ ok: false, error: error instanceof Error ? error.message : 'Failed' });
        }
      },
    );

    socket.on(
      'chat:message',
      async (
        payload: {
          conversationId: string;
          body?: string;
          type?: string;
          mediaUrl?: string;
          fileName?: string;
          replyToId?: string;
        },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const message = await sendMessage(user.id, payload.conversationId, {
            body: payload.body,
            type: (payload.type as 'TEXT') ?? 'TEXT',
            mediaUrl: payload.mediaUrl,
            fileName: payload.fileName,
            replyToId: payload.replyToId,
          });
          const { peerIds, ...publicMsg } = message;
          io.to(`conversation:${payload.conversationId}`).emit('chat:message', publicMsg);
          for (const peerId of peerIds) {
            io.to(`user:${peerId}`).emit('chat:notify', publicMsg);
            io.to(`user:${peerId}`).emit('chat:message', publicMsg);
          }
          ack?.({ ok: true, message: publicMsg });
        } catch (error) {
          ack?.({ ok: false, error: error instanceof Error ? error.message : 'Failed' });
        }
      },
    );

    socket.on('messageSeen', async (payload: { conversationId: string }, ack?: (r: unknown) => void) => {
      try {
        if (!payload?.conversationId) return;
        const data = await markConversationRead(user.id, payload.conversationId);
        for (const peerId of data.peerIds) {
          emitToUser(peerId, 'chat:message:seen', {
            conversationId: data.conversationId,
            seenAt: data.seenAt,
            readerId: user.id,
          });
          emitToUser(peerId, 'messageSeen', {
            conversationId: data.conversationId,
            seenAt: data.seenAt,
            readerId: user.id,
          });
        }
        ack?.({ ok: true, count: data.count });
      } catch (error) {
        ack?.({ ok: false, error: error instanceof Error ? error.message : 'Failed' });
      }
    });

    socket.on('chat:read', async (payload: { conversationId: string }) => {
      if (!payload?.conversationId) return;
      try {
        const data = await markConversationRead(user.id, payload.conversationId);
        for (const peerId of data.peerIds) {
          emitToUser(peerId, 'chat:message:seen', {
            conversationId: data.conversationId,
            seenAt: data.seenAt,
            readerId: user.id,
          });
        }
      } catch {
        /* ignore */
      }
    });

    // ── Call signaling (WebRTC) ───────────────────────────
    socket.on(
      'call:signal',
      async (payload: {
        toUserId: string;
        signal: unknown;
        callId?: string;
        type?: string;
      }) => {
        if (!payload?.toUserId || typeof payload.toUserId !== 'string') return;
        // Only relay to intended user; never broadcast globally
        io.to(`user:${payload.toUserId}`).emit('call:signal', {
          fromUserId: user.id,
          signal: payload.signal,
          callId: payload.callId,
          type: payload.type,
        });
      },
    );

    socket.on(
      'callInvitation',
      (payload: { toUserId: string; callId: string; callType: string; roomName?: string }) => {
        if (!payload?.toUserId) return;
        io.to(`user:${payload.toUserId}`).emit('callInvitation', {
          fromUserId: user.id,
          callId: payload.callId,
          callType: payload.callType,
          roomName: payload.roomName,
        });
        io.to(`user:${payload.toUserId}`).emit('call:signal', {
          fromUserId: user.id,
          callId: payload.callId,
          type: payload.callType,
          signal: {
            type: 'invite',
            callId: payload.callId,
            callType: payload.callType,
            fromUserId: user.id,
            roomName: payload.roomName,
          },
        });
      },
    );

    socket.on('callAccepted', (payload: { toUserId: string; callId: string }) => {
      if (!payload?.toUserId) return;
      io.to(`user:${payload.toUserId}`).emit('callAccepted', {
        fromUserId: user.id,
        callId: payload.callId,
      });
      io.to(`user:${payload.toUserId}`).emit('call:signal', {
        fromUserId: user.id,
        callId: payload.callId,
        signal: { type: 'accepted', callId: payload.callId },
      });
    });

    socket.on('callRejected', (payload: { toUserId: string; callId: string }) => {
      if (!payload?.toUserId) return;
      io.to(`user:${payload.toUserId}`).emit('callRejected', {
        fromUserId: user.id,
        callId: payload.callId,
      });
      io.to(`user:${payload.toUserId}`).emit('call:signal', {
        fromUserId: user.id,
        callId: payload.callId,
        signal: { type: 'reject' },
      });
    });

    socket.on('callEnded', (payload: { toUserId: string; callId: string; reason?: string }) => {
      if (!payload?.toUserId) return;
      io.to(`user:${payload.toUserId}`).emit('callEnded', {
        fromUserId: user.id,
        callId: payload.callId,
        reason: payload.reason,
      });
      io.to(`user:${payload.toUserId}`).emit('call:signal', {
        fromUserId: user.id,
        callId: payload.callId,
        signal: { type: 'hangup', reason: payload.reason },
      });
    });

    socket.on('offer', (payload: { toUserId: string; callId?: string; sdp: RTCSessionDescriptionInit }) => {
      if (!payload?.toUserId || !payload.sdp) return;
      io.to(`user:${payload.toUserId}`).emit('offer', {
        fromUserId: user.id,
        callId: payload.callId,
        sdp: payload.sdp,
      });
      io.to(`user:${payload.toUserId}`).emit('call:signal', {
        fromUserId: user.id,
        callId: payload.callId,
        signal: { type: 'offer', sdp: payload.sdp },
      });
    });

    socket.on('answer', (payload: { toUserId: string; callId?: string; sdp: RTCSessionDescriptionInit }) => {
      if (!payload?.toUserId || !payload.sdp) return;
      io.to(`user:${payload.toUserId}`).emit('answer', {
        fromUserId: user.id,
        callId: payload.callId,
        sdp: payload.sdp,
      });
      io.to(`user:${payload.toUserId}`).emit('call:signal', {
        fromUserId: user.id,
        callId: payload.callId,
        signal: { type: 'answer', sdp: payload.sdp },
      });
    });

    socket.on(
      'iceCandidate',
      (payload: { toUserId: string; callId?: string; candidate: RTCIceCandidateInit }) => {
        if (!payload?.toUserId || !payload.candidate) return;
        io.to(`user:${payload.toUserId}`).emit('iceCandidate', {
          fromUserId: user.id,
          callId: payload.callId,
          candidate: payload.candidate,
        });
        io.to(`user:${payload.toUserId}`).emit('call:signal', {
          fromUserId: user.id,
          callId: payload.callId,
          signal: { type: 'ice', candidate: payload.candidate },
        });
      },
    );

    socket.on('disconnect', async () => {
      const count = (connectionCounts.get(user.id) ?? 1) - 1;
      if (count <= 0) {
        connectionCounts.delete(user.id);
        await prisma.user.update({
          where: { id: user.id },
          data: { online: false, lastSeen: new Date() },
        });
        io.emit('presence:update', {
          userId: user.id,
          online: false,
          lastSeen: new Date().toISOString(),
        });
        io.emit('userOffline', { userId: user.id });
      } else {
        connectionCounts.set(user.id, count);
      }
    });
  });

  return io;
}
