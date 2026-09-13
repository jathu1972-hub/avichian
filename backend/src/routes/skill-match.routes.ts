import { Router } from 'express';
import { z } from 'zod';
import { SkillMatchVisibility, SkillProficiency } from '@prisma/client';
import { authenticate, requirePasswordReady, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { routeParam } from '../utils/route-param.js';
import { AppError } from '../utils/errors.js';
import {
  acceptSkillConnect,
  cancelSkillConnect,
  declineSkillConnect,
  discoverMatches,
  getCatalog,
  getMatchProfile,
  getMySkillMatch,
  listSkillRequests,
  saveMySkillMatch,
  sendSkillConnect,
} from '../services/skill-match.service.js';

const saveSchema = z.object({
  skills: z
    .array(
      z.object({
        skillId: z.string().uuid(),
        proficiency: z.nativeEnum(SkillProficiency),
      }),
    )
    .optional(),
  interestIds: z.array(z.string().uuid()).optional(),
  goalIds: z.array(z.string().uuid()).optional(),
  availabilityIds: z.array(z.string().uuid()).optional(),
  visibility: z.nativeEnum(SkillMatchVisibility).optional(),
});

const connectSchema = z.object({
  userId: z.string().uuid(),
});

const requestIdSchema = z.object({
  requestId: z.string().uuid(),
});

export const skillMatchRouter = Router();

skillMatchRouter.use(authenticate, requirePasswordReady, requireRoles('STUDENT', 'STAFF'));

skillMatchRouter.get('/catalog', async (_req, res, next) => {
  try {
    const data = await getCatalog();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

skillMatchRouter.get('/me', async (req: AuthRequest, res, next) => {
  try {
    const data = await getMySkillMatch(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

skillMatchRouter.put('/me', validateBody(saveSchema), async (req: AuthRequest, res, next) => {
  try {
    const data = await saveMySkillMatch(req.user!.id, req.body);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

skillMatchRouter.get('/discover', async (req: AuthRequest, res, next) => {
  try {
    const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : 'best';
    const sort = (['best', 'relevant', 'recent'].includes(sortRaw) ? sortRaw : 'best') as
      | 'best'
      | 'relevant'
      | 'recent';
    const year =
      typeof req.query.year === 'string' && Number(req.query.year)
        ? Number(req.query.year)
        : undefined;
    const limit =
      typeof req.query.limit === 'string' && Number(req.query.limit)
        ? Number(req.query.limit)
        : 12;
    const data = await discoverMatches(req.user!.id, {
      q: typeof req.query.q === 'string' ? req.query.q : undefined,
      skillId: typeof req.query.skillId === 'string' ? req.query.skillId : undefined,
      categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined,
      departmentId: typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined,
      year,
      goalId: typeof req.query.goalId === 'string' ? req.query.goalId : undefined,
      availabilityId:
        typeof req.query.availabilityId === 'string' ? req.query.availabilityId : undefined,
      sort,
      cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
      limit,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

skillMatchRouter.get('/requests', async (req: AuthRequest, res, next) => {
  try {
    const data = await listSkillRequests(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

skillMatchRouter.post(
  '/connect',
  validateBody(connectSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await sendSkillConnect(req.user!.id, req.body.userId);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

skillMatchRouter.post(
  '/accept',
  validateBody(requestIdSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await acceptSkillConnect(req.user!.id, req.body.requestId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

skillMatchRouter.post(
  '/decline',
  validateBody(requestIdSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await declineSkillConnect(req.user!.id, req.body.requestId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

skillMatchRouter.post(
  '/cancel',
  validateBody(requestIdSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await cancelSkillConnect(req.user!.id, req.body.requestId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

skillMatchRouter.get('/users/:userId', async (req: AuthRequest, res, next) => {
  try {
    const userId = routeParam(req.params.userId);
    if (!z.string().uuid().safeParse(userId).success) {
      throw new AppError(400, 'Invalid user id');
    }
    const data = await getMatchProfile(req.user!.id, userId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
