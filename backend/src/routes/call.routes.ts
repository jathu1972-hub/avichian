import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { listCallHistory, startCall, updateCallStatus } from '../services/call.service.js';
import { routeParam } from '../utils/route-param.js';

export const callRouter = Router();
callRouter.use(authenticate, requireRoles('STUDENT', 'STAFF'));

callRouter.get('/history', async (req: AuthRequest, res, next) => {
  try {
    const data = await listCallHistory(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

callRouter.post(
  '/start',
  validateBody(
    z.object({
      receiverId: z.string().uuid(),
      type: z.enum(['VOICE', 'VIDEO']),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await startCall(req.user!.id, req.body.receiverId, req.body.type);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

callRouter.post(
  '/:callId/status',
  validateBody(
    z.object({
      status: z.enum(['RINGING', 'MISSED', 'REJECTED', 'COMPLETED', 'FAILED']),
      duration: z.number().int().min(0).optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await updateCallStatus(
        req.user!.id,
        routeParam(req.params.callId),
        req.body.status,
        req.body.duration ?? 0,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);
