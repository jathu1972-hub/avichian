import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePasswordReady, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { getRequestMeta } from '../middleware/request-meta.js';
import {
  changePassword,
  getLoginHistory,
  getSettingsBundle,
  getStorageUsage,
  logoutAllDevices,
  updateAppearanceSettings,
  updateNotificationSettings,
  updatePrivacySettings,
} from '../services/settings.service.js';

export const settingsRouter = Router();
settingsRouter.use(authenticate, requireRoles('STUDENT', 'STAFF'));
// Password change allowed while forcePasswordChange; other settings gated
settingsRouter.use((req, res, next) => {
  if (req.path === '/security/password' && req.method === 'PUT') {
    next();
    return;
  }
  requirePasswordReady(req, res, next);
});

settingsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const data = await getSettingsBundle(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put(
  '/privacy',
  validateBody(
    z.object({
      privateAccount: z.boolean().optional(),
      whoCanMessage: z.enum(['EVERYONE', 'FRIENDS', 'NOBODY']).optional(),
      whoCanCall: z.enum(['EVERYONE', 'FRIENDS', 'NOBODY']).optional(),
      whoCanSeePosts: z.enum(['PUBLIC', 'FRIENDS', 'DEPARTMENT', 'PRIVATE']).optional(),
      whoCanSeeStories: z.enum(['PUBLIC', 'FRIENDS', 'DEPARTMENT', 'PRIVATE']).optional(),
      whoCanSeeProfile: z.enum(['PUBLIC', 'FRIENDS', 'DEPARTMENT', 'PRIVATE']).optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await updatePrivacySettings(req.user!.id, req.body);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

settingsRouter.put(
  '/notifications',
  validateBody(
    z.object({
      likes: z.boolean().optional(),
      comments: z.boolean().optional(),
      friendRequests: z.boolean().optional(),
      messages: z.boolean().optional(),
      calls: z.boolean().optional(),
      events: z.boolean().optional(),
      communities: z.boolean().optional(),
      announcements: z.boolean().optional(),
      reminders: z.boolean().optional(),
      pushEnabled: z.boolean().optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await updateNotificationSettings(req.user!.id, req.body);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

settingsRouter.put(
  '/appearance',
  validateBody(
    z.object({
      theme: z.enum(['light', 'dark', 'system']).optional(),
      accentColor: z.string().max(40).optional(),
      fontScale: z.enum(['small', 'medium', 'large']).optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await updateAppearanceSettings(req.user!.id, req.body);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

settingsRouter.put(
  '/security/password',
  validateBody(
    z.object({
      currentPassword: z.string().min(1),
      newPassword: z.string().min(8).max(128),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await changePassword(
        req.user!.id,
        req.body.currentPassword,
        req.body.newPassword,
        getRequestMeta(req),
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

settingsRouter.get('/storage', async (req: AuthRequest, res, next) => {
  try {
    const data = await getStorageUsage(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

settingsRouter.get('/sessions', async (req: AuthRequest, res, next) => {
  try {
    const bundle = await getSettingsBundle(req.user!.id);
    res.json({ success: true, data: bundle.sessions });
  } catch (error) {
    next(error);
  }
});

settingsRouter.get('/login-history', async (req: AuthRequest, res, next) => {
  try {
    const data = await getLoginHistory(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

settingsRouter.post('/logout-all', async (req: AuthRequest, res, next) => {
  try {
    const data = await logoutAllDevices(req.user!.id, getRequestMeta(req));
    res.clearCookie('refresh_token', { path: '/api/auth' });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
