import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { getRequestMeta } from '../middleware/request-meta.js';
import { mediaUrlSchema, optionalMediaUrlSchema } from '../utils/media.js';
import { routeParam } from '../utils/route-param.js';
import {
  archiveReel,
  createReel,
  deleteReelOwned,
  hideReel,
  listReels,
  reportReel,
  toggleReelLike,
  updateReel,
} from '../services/reels.service.js';

const createSchema = z.object({
  mediaUrl: mediaUrlSchema,
  caption: z.string().max(500).optional(),
  coverUrl: optionalMediaUrlSchema,
  visibility: z.enum(['PUBLIC', 'FRIENDS', 'DEPARTMENT', 'PRIVATE']).optional(),
});

const updateSchema = z.object({
  caption: z.string().max(500).optional(),
  coverUrl: optionalMediaUrlSchema.nullable().optional(),
  visibility: z.enum(['PUBLIC', 'FRIENDS', 'DEPARTMENT', 'PRIVATE']).optional(),
});

const reportSchema = z.object({
  reason: z.string().min(1).max(40),
  details: z.string().max(2000).optional(),
});

export const reelsRouter = Router();

reelsRouter.use(authenticate, requireRoles('STUDENT', 'STAFF', 'SUPER_ADMIN'));

reelsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const data = await listReels(req.user!.id, req.user!.departmentId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

reelsRouter.post('/', validateBody(createSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await createReel(req.user!.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

reelsRouter.patch('/:reelId', validateBody(updateSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await updateReel(
      { id: req.user!.id, role: req.user!.role },
      routeParam(req.params.reelId),
      req.body,
      getRequestMeta(req),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

reelsRouter.delete('/:reelId', async (req: AuthRequest, res, next) => {
  try {
    const data = await deleteReelOwned(
      { id: req.user!.id, role: req.user!.role },
      routeParam(req.params.reelId),
      getRequestMeta(req),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

reelsRouter.post('/:reelId/archive', async (req: AuthRequest, res, next) => {
  try {
    const data = await archiveReel(
      { id: req.user!.id, role: req.user!.role },
      routeParam(req.params.reelId),
      getRequestMeta(req),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

reelsRouter.post('/:reelId/hide', async (req: AuthRequest, res, next) => {
  try {
    const data = await hideReel(req.user!.id, routeParam(req.params.reelId));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

reelsRouter.post(
  '/:reelId/report',
  validateBody(reportSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await reportReel(
        req.user!.id,
        routeParam(req.params.reelId),
        req.body.reason,
        req.body.details,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

reelsRouter.post('/:reelId/like', async (req: AuthRequest, res, next) => {
  try {
    const data = await toggleReelLike(req.user!.id, routeParam(req.params.reelId));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
