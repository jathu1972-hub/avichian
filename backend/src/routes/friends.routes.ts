import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePasswordReady, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import {
  acceptFriendRequest,
  acceptFriendRequestByUserId,
  blockUser,
  cancelFriendRequest,
  listBlockedUsers,
  listFriends,
  listPendingRequests,
  rejectFriendRequest,
  sendFriendRequest,
  unblockUser,
  unfriend,
} from '../services/friends.service.js';
import { routeParam } from '../utils/route-param.js';

const sendRequestSchema = z.object({
  receiverId: z.string().uuid(),
});

const userIdBodySchema = z.object({
  userId: z.string().uuid(),
});

export const friendsRouter = Router();

friendsRouter.use(authenticate, requirePasswordReady, requireRoles('STUDENT', 'STAFF'));

// Spec aliases + existing paths
friendsRouter.get(['/', '/list'], async (req: AuthRequest, res, next) => {
  try {
    const friends = await listFriends(req.user!.id);
    res.json({ success: true, data: friends });
  } catch (error) {
    next(error);
  }
});

friendsRouter.get('/blocked', async (req: AuthRequest, res, next) => {
  try {
    const data = await listBlockedUsers(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

friendsRouter.get(['/requests', '/pending'], async (req: AuthRequest, res, next) => {
  try {
    const requests = await listPendingRequests(req.user!.id);
    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
});

friendsRouter.post(
  ['/requests', '/request'],
  validateBody(sendRequestSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const { receiverId } = req.body as z.infer<typeof sendRequestSchema>;
      const request = await sendFriendRequest(req.user!.id, receiverId);
      res.status(201).json({ success: true, data: request });
    } catch (error) {
      next(error);
    }
  },
);

friendsRouter.post('/requests/:requestId/accept', async (req: AuthRequest, res, next) => {
  try {
    const request = await acceptFriendRequest(req.user!.id, routeParam(req.params.requestId));
    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
});

friendsRouter.post(
  '/accept',
  validateBody(
    z.object({
      requestId: z.string().uuid().optional(),
      userId: z.string().uuid().optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      if (req.body.requestId) {
        const request = await acceptFriendRequest(req.user!.id, req.body.requestId);
        res.json({ success: true, data: request });
        return;
      }
      if (req.body.userId) {
        const request = await acceptFriendRequestByUserId(req.user!.id, req.body.userId);
        res.json({ success: true, data: request });
        return;
      }
      res.status(400).json({ success: false, error: 'requestId or userId required' });
    } catch (error) {
      next(error);
    }
  },
);

friendsRouter.post('/requests/:requestId/reject', async (req: AuthRequest, res, next) => {
  try {
    const request = await rejectFriendRequest(req.user!.id, routeParam(req.params.requestId));
    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
});

friendsRouter.post(
  '/reject',
  validateBody(z.object({ requestId: z.string().uuid() })),
  async (req: AuthRequest, res, next) => {
    try {
      const request = await rejectFriendRequest(req.user!.id, req.body.requestId);
      res.json({ success: true, data: request });
    } catch (error) {
      next(error);
    }
  },
);

friendsRouter.post('/requests/:requestId/cancel', async (req: AuthRequest, res, next) => {
  try {
    const request = await cancelFriendRequest(req.user!.id, routeParam(req.params.requestId));
    res.json({ success: true, data: request });
  } catch (error) {
    next(error);
  }
});

friendsRouter.delete(
  '/cancel',
  validateBody(z.object({ requestId: z.string().uuid() })),
  async (req: AuthRequest, res, next) => {
    try {
      const request = await cancelFriendRequest(req.user!.id, req.body.requestId);
      res.json({ success: true, data: request });
    } catch (error) {
      next(error);
    }
  },
);

friendsRouter.post('/unfriend', validateBody(userIdBodySchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await unfriend(req.user!.id, req.body.userId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

friendsRouter.delete('/remove', validateBody(userIdBodySchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await unfriend(req.user!.id, req.body.userId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

friendsRouter.post('/block', validateBody(userIdBodySchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await blockUser(req.user!.id, req.body.userId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

friendsRouter.post('/unblock', validateBody(userIdBodySchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await unblockUser(req.user!.id, req.body.userId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
