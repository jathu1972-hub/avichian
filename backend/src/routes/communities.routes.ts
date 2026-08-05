import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, requirePasswordReady, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { routeParam } from '../utils/route-param.js';
import {
  createCommunityPost,
  deleteCommunityPost,
  getCommunityDetail,
  joinCommunity,
  leaveCommunity,
  listCommunitiesForUser,
  listCommunityPosts,
  listMembers,
} from '../services/communities.service.js';

export const communitiesRouter = Router();
communitiesRouter.use(authenticate, requirePasswordReady, requireRoles('STUDENT', 'STAFF', 'SUPER_ADMIN'));

const joinLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

communitiesRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const data = await listCommunitiesForUser(req.user!.id, req.user!.departmentId, {
      search: req.query.search as string | undefined,
      category: req.query.category as string | undefined,
      filter: req.query.filter as string | undefined,
      sort: req.query.sort as string | undefined,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

communitiesRouter.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const isAdmin = req.user!.role === 'SUPER_ADMIN';
    const data = await getCommunityDetail(routeParam(req.params.id), req.user!.id, isAdmin);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

communitiesRouter.post('/:id/join', joinLimiter, async (req: AuthRequest, res, next) => {
  try {
    const data = await joinCommunity(req.user!.id, routeParam(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

communitiesRouter.post('/:id/leave', joinLimiter, async (req: AuthRequest, res, next) => {
  try {
    const data = await leaveCommunity(req.user!.id, routeParam(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

communitiesRouter.get('/:id/members', async (req: AuthRequest, res, next) => {
  try {
    const isAdmin = req.user!.role === 'SUPER_ADMIN';
    const data = await listMembers(routeParam(req.params.id), req.user!.id, isAdmin);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

communitiesRouter.get('/:id/posts', async (req: AuthRequest, res, next) => {
  try {
    const isAdmin = req.user!.role === 'SUPER_ADMIN';
    const data = await listCommunityPosts(routeParam(req.params.id), req.user!.id, isAdmin);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

communitiesRouter.post(
  '/:id/posts',
  validateBody(
    z.object({
      content: z.string().max(4000).optional(),
      mediaUrl: z.string().max(500_000).optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await createCommunityPost(req.user!.id, routeParam(req.params.id), req.body);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

communitiesRouter.delete('/posts/:postId', async (req: AuthRequest, res, next) => {
  try {
    const data = await deleteCommunityPost(
      { id: req.user!.id, role: req.user!.role },
      routeParam(req.params.postId),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});
