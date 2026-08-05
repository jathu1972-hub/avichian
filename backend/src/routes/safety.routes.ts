import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, requirePasswordReady, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { routeParam } from '../utils/route-param.js';
import {
  blockAndMuteCleanup,
  listMutedUsers,
  listMyComplaints,
  listMyReports,
  muteUser,
  submitComplaint,
  submitReport,
  unmuteUser,
} from '../services/safety.service.js';
import {
  blockUser,
  listBlockedUsers,
  unblockUser,
} from '../services/friends.service.js';

export const safetyRouter = Router();
safetyRouter.use(authenticate, requirePasswordReady, requireRoles('STUDENT', 'STAFF'));

const reportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many reports. Try again later.' },
});

const reportSchema = z.object({
  targetType: z.enum(['POST', 'STORY', 'REEL', 'MESSAGE', 'USER', 'COMMENT', 'COMMUNITY']),
  targetId: z.string().min(1),
  reason: z.string().min(1).max(60),
  details: z.string().max(1000).optional(),
  evidenceUrl: z.string().max(500_000).optional().nullable(),
});

// ── Reports ───────────────────────────────────────────────
safetyRouter.post('/report', reportLimiter, validateBody(reportSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await submitReport({
      reporterId: req.user!.id,
      ...req.body,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// alias
safetyRouter.post('/reports', reportLimiter, validateBody(reportSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await submitReport({
      reporterId: req.user!.id,
      ...req.body,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

safetyRouter.get('/report/my', async (req: AuthRequest, res, next) => {
  try {
    const data = await listMyReports(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

safetyRouter.get('/reports/my', async (req: AuthRequest, res, next) => {
  try {
    const data = await listMyReports(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ── Block ─────────────────────────────────────────────────
safetyRouter.post(
  '/block',
  validateBody(z.object({ userId: z.string().uuid() })),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await blockAndMuteCleanup(req.user!.id, req.body.userId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

safetyRouter.delete('/block/:userId', async (req: AuthRequest, res, next) => {
  try {
    const data = await unblockUser(req.user!.id, routeParam(req.params.userId));
    await unmuteUser(req.user!.id, routeParam(req.params.userId)).catch(() => undefined);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

safetyRouter.get('/block', async (req: AuthRequest, res, next) => {
  try {
    const data = await listBlockedUsers(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ── Mute ──────────────────────────────────────────────────
safetyRouter.post(
  '/mute',
  validateBody(z.object({ userId: z.string().uuid() })),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await muteUser(req.user!.id, req.body.userId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

safetyRouter.delete('/mute/:userId', async (req: AuthRequest, res, next) => {
  try {
    const data = await unmuteUser(req.user!.id, routeParam(req.params.userId));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

safetyRouter.get('/mute', async (req: AuthRequest, res, next) => {
  try {
    const data = await listMutedUsers(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ── Complaints ────────────────────────────────────────────
safetyRouter.post(
  '/complaints',
  reportLimiter,
  validateBody(
    z.object({
      category: z.enum([
        'TECHNICAL',
        'LOGIN',
        'BUG',
        'STAFF',
        'CAMPUS',
        'COMMUNITY',
        'EVENT',
        'FEATURE',
        'SAFETY',
        'OTHER',
      ]),
      subject: z.string().min(3).max(200),
      description: z.string().min(10).max(4000),
      attachmentUrl: z.string().max(500_000).optional().nullable(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await submitComplaint({
        userId: req.user!.id,
        ...req.body,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

safetyRouter.get('/complaints/my', async (req: AuthRequest, res, next) => {
  try {
    const data = await listMyComplaints(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
