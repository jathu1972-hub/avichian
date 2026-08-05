import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePasswordReady, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import {
  clearAllNotifications,
  deleteNotification,
  listNotifications,
  markNotificationsRead,
} from '../services/notification.service.js';
import { routeParam } from '../utils/route-param.js';

export const notificationRouter = Router();
notificationRouter.use(authenticate, requirePasswordReady, requireRoles('STUDENT', 'STAFF'));

notificationRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const data = await listNotifications(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/** Mark one or all as read — never deletes */
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

/** Alias used by some clients */
notificationRouter.post('/read-all', async (req: AuthRequest, res, next) => {
  try {
    const data = await markNotificationsRead(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/** Explicit permanent clear */
notificationRouter.post('/clear', async (req: AuthRequest, res, next) => {
  try {
    const data = await clearAllNotifications(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

notificationRouter.delete('/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = await deleteNotification(req.user!.id, routeParam(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
