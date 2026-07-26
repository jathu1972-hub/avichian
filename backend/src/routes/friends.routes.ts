import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  listFriends,
  listPendingRequests,
  rejectFriendRequest,
  sendFriendRequest,
} from '../services/friends.service.js';
import { routeParam } from '../utils/route-param.js';

const sendRequestSchema = z.object({
  receiverId: z.string().uuid(),
});

export const friendsRouter = Router();

friendsRouter.use(authenticate, requireRoles('STUDENT', 'STAFF'));

friendsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const friends = await listFriends(req.user!.id);
    res.json({ success: true, data: friends });
  } catch (error) {
    next(error);
  }
});

friendsRouter.get('/requests', async (req: AuthRequest, res, next) => {
  try {
    const requests = await listPendingRequests(req.user!.id);
    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
});

friendsRouter.post('/requests', validateBody(sendRequestSchema), async (req: AuthRequest, res, next) => {
  try {
    const { receiverId } = req.body as z.infer<typeof sendRequestSchema>;
    const request = await sendFriendRequest(req.user!.id, receiverId);
    res.status(201).json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
});

friendsRouter.post('/requests/:requestId/accept', async (req: AuthRequest, res, next) => {
  try {
    const request = await acceptFriendRequest(req.user!.id, routeParam(req.params.requestId));
    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
});

friendsRouter.post('/requests/:requestId/reject', async (req: AuthRequest, res, next) => {
  try {
    const request = await rejectFriendRequest(req.user!.id, routeParam(req.params.requestId));
    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
});

friendsRouter.post('/requests/:requestId/cancel', async (req: AuthRequest, res, next) => {
  try {
    const request = await cancelFriendRequest(req.user!.id, routeParam(req.params.requestId));
    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
});
