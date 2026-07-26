import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from './config/env.js';
import { sendMessage } from './services/chat.service.js';
import { prisma } from './lib/prisma.js';

interface SocketUser {
  id: string;
  regNo: string;
  role: string;
}

export function attachSocketServer(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.frontendUrls.length ? env.frontendUrls : true,
      credentials: true,
    },
    path: '/socket.io',
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

  io.on('connection', async (socket) => {
    const user = (socket.data as { user: SocketUser }).user;
    socket.join(`user:${user.id}`);

    await prisma.user.update({
      where: { id: user.id },
      data: { online: true, lastSeen: new Date() },
    });
    socket.broadcast.emit('presence:update', { userId: user.id, online: true });

    socket.on('chat:join', (conversationId: string) => {
      socket.join(`conversation:${conversationId}`);
    });

    socket.on('chat:typing', (payload: { conversationId: string; typing: boolean }) => {
      socket.to(`conversation:${payload.conversationId}`).emit('chat:typing', {
        conversationId: payload.conversationId,
        userId: user.id,
        typing: payload.typing,
      });
    });

    socket.on(
      'chat:message',
      async (
        payload: { conversationId: string; body?: string; type?: string; mediaUrl?: string },
        ack?: (res: unknown) => void,
      ) => {
        try {
          const message = await sendMessage(user.id, payload.conversationId, {
            body: payload.body,
            type: (payload.type as 'TEXT') ?? 'TEXT',
            mediaUrl: payload.mediaUrl,
          });
          io.to(`conversation:${payload.conversationId}`).emit('chat:message', message);
          for (const peerId of message.peerIds) {
            io.to(`user:${peerId}`).emit('chat:notify', message);
          }
          ack?.({ ok: true, message });
        } catch (error) {
          ack?.({ ok: false, error: error instanceof Error ? error.message : 'Failed' });
        }
      },
    );

    socket.on(
      'call:signal',
      (payload: { toUserId: string; signal: unknown; callId?: string; type?: string }) => {
        io.to(`user:${payload.toUserId}`).emit('call:signal', {
          fromUserId: user.id,
          signal: payload.signal,
          callId: payload.callId,
          type: payload.type,
        });
      },
    );

    socket.on('disconnect', async () => {
      await prisma.user.update({
        where: { id: user.id },
        data: { online: false, lastSeen: new Date() },
      });
      socket.broadcast.emit('presence:update', { userId: user.id, online: false });
    });
  });

  return io;
}
