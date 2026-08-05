import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { authenticate, requirePasswordReady, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { getRequestMeta } from '../middleware/request-meta.js';
import { mediaUrlSchema, optionalMediaUrlSchema } from '../utils/media.js';
import { routeParam } from '../utils/route-param.js';
import { AppError } from '../utils/errors.js';
import {
  addReelComment,
  archiveReel,
  createReel,
  createReelWithFiles,
  deleteReelComment,
  deleteReelOwned,
  getReelById,
  hideReel,
  listReelComments,
  listReels,
  listSavedReels,
  listUserReels,
  recordReelView,
  reportComment,
  reportReel,
  toggleCommentLike,
  toggleReelLike,
  toggleSaveReel,
  updateReel,
} from '../services/reels.service.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024, files: 2 },
});

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many reel uploads. Try again later.' },
});

const createSchema = z.object({
  mediaUrl: mediaUrlSchema,
  mediaMimeType: z.string().max(120).optional().nullable(),
  caption: z.string().max(500).optional(),
  coverUrl: optionalMediaUrlSchema,
  hashtags: z.union([z.array(z.string()), z.string()]).optional(),
  audioName: z.string().max(80).optional(),
  durationSec: z.coerce.number().int().positive().max(90).optional().nullable(),
  visibility: z.enum(['PUBLIC', 'FRIENDS', 'DEPARTMENT', 'PRIVATE']).optional(),
});

const updateSchema = z.object({
  caption: z.string().max(500).optional(),
  coverUrl: optionalMediaUrlSchema.nullable().optional(),
  visibility: z.enum(['PUBLIC', 'FRIENDS', 'DEPARTMENT', 'PRIVATE']).optional(),
  hashtags: z.union([z.array(z.string()), z.string()]).optional(),
  audioName: z.string().max(80).nullable().optional(),
});

const reportSchema = z.object({
  reason: z.string().min(1).max(40),
  details: z.string().max(2000).optional(),
});

const commentSchema = z.object({
  body: z.string().min(1).max(500),
  parentId: z.string().uuid().optional().nullable(),
});

export const reelsRouter = Router();

reelsRouter.use(authenticate, requirePasswordReady, requireRoles('STUDENT', 'STAFF', 'SUPER_ADMIN'));

reelsRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const data = await listReels(req.user!.id, req.user!.departmentId, {
      limit: Number(req.query.limit ?? 30),
      cursor: req.query.cursor as string | undefined,
      search: req.query.search as string | undefined,
      hashtag: req.query.hashtag as string | undefined,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

reelsRouter.get('/saved/me', async (req: AuthRequest, res, next) => {
  try {
    const data = await listSavedReels(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

reelsRouter.get('/user/:userId', async (req: AuthRequest, res, next) => {
  try {
    const data = await listUserReels(
      req.user!.id,
      routeParam(req.params.userId),
      req.user!.departmentId,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

reelsRouter.get('/:reelId', async (req: AuthRequest, res, next) => {
  try {
    const data = await getReelById(
      req.user!.id,
      req.user!.departmentId,
      routeParam(req.params.reelId),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

reelsRouter.post(
  '/',
  uploadLimiter,
  validateBody(createSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await createReel(req.user!.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

/** Multipart: video (+ optional cover) in one request */
reelsRouter.post(
  '/upload',
  uploadLimiter,
  upload.fields([
    { name: 'video', maxCount: 1 },
    { name: 'file', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  async (req: AuthRequest, res, next) => {
    try {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const video = files?.video?.[0] || files?.file?.[0];
      if (!video) {
        throw new AppError(400, 'Send multipart field "video" (or "file")', 'NO_FILE');
      }
      // Block dangerous extensions even if MIME is spoofed
      const name = (video.originalname || '').toLowerCase();
      if (/\.(exe|apk|bat|cmd|js|php|sh|msi|dll)$/i.test(name)) {
        throw new AppError(400, 'File type not allowed', 'INVALID_FILE');
      }

      const visibilityRaw = String(req.body?.visibility || 'DEPARTMENT').toUpperCase();
      const visibilityMap: Record<string, 'PUBLIC' | 'FRIENDS' | 'DEPARTMENT' | 'PRIVATE'> = {
        CAMPUS: 'PUBLIC',
        PUBLIC: 'PUBLIC',
        DEPARTMENT: 'DEPARTMENT',
        FRIENDS: 'FRIENDS',
        'FRIENDS ONLY': 'FRIENDS',
        FRIENDS_ONLY: 'FRIENDS',
        PRIVATE: 'PRIVATE',
      };

      const data = await createReelWithFiles(
        req.user!.id,
        {
          video: {
            buffer: video.buffer,
            mimetype: video.mimetype,
            originalname: video.originalname,
            size: video.size,
          },
          cover: files?.cover?.[0]
            ? {
                buffer: files.cover[0].buffer,
                mimetype: files.cover[0].mimetype,
                originalname: files.cover[0].originalname,
                size: files.cover[0].size,
              }
            : undefined,
        },
        {
          caption: req.body?.caption,
          hashtags: req.body?.hashtags,
          audioName: req.body?.audioName,
          durationSec: req.body?.durationSec ? Number(req.body.durationSec) : undefined,
          visibility: visibilityMap[visibilityRaw] ?? 'DEPARTMENT',
        },
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

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

// PUT alias
reelsRouter.put('/:reelId', validateBody(updateSchema), async (req: AuthRequest, res, next) => {
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

reelsRouter.post('/:reelId/view', async (req: AuthRequest, res, next) => {
  try {
    const data = await recordReelView(routeParam(req.params.reelId));
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

reelsRouter.post('/:reelId/save', async (req: AuthRequest, res, next) => {
  try {
    const data = await toggleSaveReel(req.user!.id, routeParam(req.params.reelId));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

reelsRouter.get('/:reelId/comments', async (req: AuthRequest, res, next) => {
  try {
    const data = await listReelComments(routeParam(req.params.reelId), req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

reelsRouter.post(
  '/:reelId/comment',
  validateBody(commentSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await addReelComment(
        req.user!.id,
        routeParam(req.params.reelId),
        req.body.body,
        req.body.parentId,
      );
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

reelsRouter.delete('/comments/:commentId', async (req: AuthRequest, res, next) => {
  try {
    const data = await deleteReelComment(
      { id: req.user!.id, role: req.user!.role },
      routeParam(req.params.commentId),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

reelsRouter.post('/comments/:commentId/like', async (req: AuthRequest, res, next) => {
  try {
    const data = await toggleCommentLike(req.user!.id, routeParam(req.params.commentId));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

reelsRouter.post(
  '/comments/:commentId/report',
  validateBody(z.object({ reason: z.string().min(1).max(200) })),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await reportComment(
        req.user!.id,
        routeParam(req.params.commentId),
        req.body.reason,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);
