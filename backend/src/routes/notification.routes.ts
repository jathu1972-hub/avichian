import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { listNotifications, markNotificationsRead } from '../services/notification.service.js';

export const notificationRouter = Router();
notificationRouter.use(authenticate, requireRoles('STUDENT', 'STAFF'));

notificationRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const data = await listNotifications(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

notificationRouter.post(
  '/read',
  validateBody(z.object({ ids: z.array(z.string().uuid()).optional() })),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await markNotificationsRead(req.user!.id, req.body.ids);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);
