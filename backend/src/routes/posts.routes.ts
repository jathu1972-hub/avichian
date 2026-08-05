import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePasswordReady, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import {
  archivePost,
  createPost,
  deletePostOwned,
  getFeed,
  getUserPosts,
  hidePost,
  reportPost,
  togglePostLike,
  updatePost,
} from '../services/posts.service.js';
import { optionalMediaUrlSchema } from '../utils/media.js';
import { routeParam } from '../utils/route-param.js';
import { getRequestMeta } from '../middleware/request-meta.js';

const createPostSchema = z.object({
  caption: z.string().max(2000).optional(),
  mediaUrl: optionalMediaUrlSchema,
  mediaMimeType: z.string().max(120).optional().nullable(),
  visibility: z.enum(['PUBLIC', 'FRIENDS', 'DEPARTMENT', 'PRIVATE']).optional(),
});

const updatePostSchema = z.object({
  caption: z.string().max(2000).optional(),
  visibility: z.enum(['PUBLIC', 'FRIENDS', 'DEPARTMENT', 'PRIVATE']).optional(),
});

const reportSchema = z.object({
  reason: z.string().min(1).max(40),
  details: z.string().max(2000).optional(),
});

export const postsRouter = Router();

postsRouter.use(authenticate, requirePasswordReady, requireRoles('STUDENT', 'STAFF', 'SUPER_ADMIN'));

postsRouter.get('/feed', async (req: AuthRequest, res, next) => {
  try {
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const feed = await getFeed(req.user!.id, req.user!.departmentId, cursor, limit);
    res.json({ success: true, data: feed });
  } catch (error) {
    next(error);
  }
});

postsRouter.get('/user/:userId', async (req: AuthRequest, res, next) => {
  try {
    const posts = await getUserPosts(
      req.user!.id,
      routeParam(req.params.userId),
      req.user!.departmentId,
    );
    res.json({ success: true, data: posts });
  } catch (error) {
    next(error);
  }
});

postsRouter.post('/', validateBody(createPostSchema), async (req: AuthRequest, res, next) => {
  try {
    const body = req.body as z.infer<typeof createPostSchema>;
    const post = await createPost(req.user!.id, body);
    res.status(201).json({ success: true, data: post });
  } catch (error) {
    next(error);
  }
});

postsRouter.patch(
  '/:postId',
  validateBody(updatePostSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await updatePost(
        { id: req.user!.id, role: req.user!.role },
        routeParam(req.params.postId),
        req.body,
        getRequestMeta(req),
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

postsRouter.delete('/:postId', async (req: AuthRequest, res, next) => {
  try {
    const data = await deletePostOwned(
      { id: req.user!.id, role: req.user!.role },
      routeParam(req.params.postId),
      getRequestMeta(req),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

postsRouter.post('/:postId/archive', async (req: AuthRequest, res, next) => {
  try {
    const data = await archivePost(
      { id: req.user!.id, role: req.user!.role },
      routeParam(req.params.postId),
      getRequestMeta(req),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

postsRouter.post('/:postId/hide', async (req: AuthRequest, res, next) => {
  try {
    const data = await hidePost(req.user!.id, routeParam(req.params.postId));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

postsRouter.post(
  '/:postId/report',
  validateBody(reportSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await reportPost(
        req.user!.id,
        routeParam(req.params.postId),
        req.body.reason,
        req.body.details,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

postsRouter.post('/:postId/like', async (req: AuthRequest, res, next) => {
  try {
    const result = await togglePostLike(req.user!.id, routeParam(req.params.postId));
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});
