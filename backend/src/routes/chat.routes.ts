import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import {
  listConversations,
  listMessages,
  openChatWithPeer,
  sendMessage,
} from '../services/chat.service.js';
import { routeParam } from '../utils/route-param.js';

export const chatRouter = Router();
chatRouter.use(authenticate, requireRoles('STUDENT', 'STAFF'));

chatRouter.get('/conversations', async (req: AuthRequest, res, next) => {
  try {
    const data = await listConversations(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

chatRouter.post(
  '/with/:peerId',
  async (req: AuthRequest, res, next) => {
    try {
      const data = await openChatWithPeer(req.user!.id, routeParam(req.params.peerId));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

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

chatRouter.post(
  '/conversations/:id/messages',
  validateBody(
    z.object({
      body: z.string().max(4000).optional(),
      type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'PDF', 'VOICE', 'SYSTEM']).optional(),
      mediaUrl: z.string().max(500_000).optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await sendMessage(req.user!.id, routeParam(req.params.id), req.body);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);
