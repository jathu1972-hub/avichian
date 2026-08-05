import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePasswordReady, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import {
  deleteMessage,
  editMessage,
  listConversations,
  listMessages,
  markConversationRead,
  openChatWithPeer,
  sendMessage,
} from '../services/chat.service.js';
import { emitChatEvent, emitToUser } from '../socket.js';
import { routeParam } from '../utils/route-param.js';

export const chatRouter = Router();
chatRouter.use(authenticate, requirePasswordReady, requireRoles('STUDENT', 'STAFF'));

const sendSchema = z.object({
  body: z.string().max(4000).optional(),
  type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'PDF', 'VOICE', 'SYSTEM']).optional(),
  mediaUrl: z.string().max(500_000).optional(),
  fileName: z.string().max(255).optional(),
  replyToId: z.string().uuid().optional().nullable(),
});

chatRouter.get('/conversations', async (req: AuthRequest, res, next) => {
  try {
    const data = await listConversations(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/** Alias: GET /api/chats */
chatRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const data = await listConversations(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

chatRouter.post('/with/:peerId', async (req: AuthRequest, res, next) => {
  try {
    const data = await openChatWithPeer(req.user!.id, routeParam(req.params.peerId));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

chatRouter.get('/conversations/:id/messages', async (req: AuthRequest, res, next) => {
  try {
    const data = await listMessages(
      req.user!.id,
      routeParam(req.params.id),
      req.query.cursor as string | undefined,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/** Alias: GET /api/chats/:id/messages */
chatRouter.get('/:id/messages', async (req: AuthRequest, res, next) => {
  try {
    const data = await listMessages(
      req.user!.id,
      routeParam(req.params.id),
      req.query.cursor as string | undefined,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

async function handleSend(req: AuthRequest, res: import('express').Response, next: import('express').NextFunction, conversationId: string) {
  try {
    const data = await sendMessage(req.user!.id, conversationId, req.body);
    const { peerIds, ...message } = data;
    emitChatEvent(conversationId, 'chat:message', message);
    for (const peerId of peerIds) {
      emitToUser(peerId, 'chat:notify', message);
      emitToUser(peerId, 'chat:message', message);
    }
    // Echo to sender rooms so multi-device stays in sync
    emitToUser(req.user!.id, 'chat:message', message);
    res.status(201).json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
}

chatRouter.post(
  '/conversations/:id/messages',
  validateBody(sendSchema),
  (req, res, next) => void handleSend(req, res, next, routeParam(req.params.id)),
);

chatRouter.post(
  '/:id/messages',
  validateBody(sendSchema),
  (req, res, next) => void handleSend(req, res, next, routeParam(req.params.id)),
);

chatRouter.patch(
  '/messages/:messageId',
  validateBody(z.object({ body: z.string().min(1).max(4000) })),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await editMessage(req.user!.id, routeParam(req.params.messageId), req.body.body);
      const { peerIds, ...message } = data;
      emitChatEvent(message.conversationId, 'chat:message:updated', message);
      for (const peerId of peerIds) {
        emitToUser(peerId, 'chat:message:updated', message);
      }
      emitToUser(req.user!.id, 'chat:message:updated', message);
      res.json({ success: true, data: message });
    } catch (error) {
      next(error);
    }
  },
);

chatRouter.delete('/messages/:messageId', async (req: AuthRequest, res, next) => {
  try {
    const data = await deleteMessage(req.user!.id, routeParam(req.params.messageId));
    const { peerIds, ...message } = data;
    emitChatEvent(message.conversationId, 'chat:message:deleted', message);
    for (const peerId of peerIds) {
      emitToUser(peerId, 'chat:message:deleted', message);
    }
    emitToUser(req.user!.id, 'chat:message:deleted', message);
    res.json({ success: true, data: message });
  } catch (error) {
    next(error);
  }
});

chatRouter.post('/conversations/:id/read', async (req: AuthRequest, res, next) => {
  try {
    const data = await markConversationRead(req.user!.id, routeParam(req.params.id));
    for (const peerId of data.peerIds) {
      emitToUser(peerId, 'chat:message:seen', {
        conversationId: data.conversationId,
        seenAt: data.seenAt,
        readerId: req.user!.id,
      });
    }
    res.json({ success: true, data: { conversationId: data.conversationId, seenAt: data.seenAt, count: data.count } });
  } catch (error) {
    next(error);
  }
});

/** Alias: POST /api/chats/:id/read */
chatRouter.post('/:id/read', async (req: AuthRequest, res, next) => {
  try {
    const data = await markConversationRead(req.user!.id, routeParam(req.params.id));
    for (const peerId of data.peerIds) {
      emitToUser(peerId, 'chat:message:seen', {
        conversationId: data.conversationId,
        seenAt: data.seenAt,
        readerId: req.user!.id,
      });
    }
    res.json({ success: true, data: { conversationId: data.conversationId, seenAt: data.seenAt, count: data.count } });
  } catch (error) {
    next(error);
  }
});
