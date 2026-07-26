import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import {
  createStory,
  createStoryWithFile,
  deleteStoryOwned,
  getActiveStories,
  hideStory,
  muteUserStories,
  reportStory,
} from '../services/stories.service.js';
import { mediaUrlSchema } from '../utils/media.js';
import { AppError } from '../utils/errors.js';
import { getRequestMeta } from '../middleware/request-meta.js';
import { routeParam } from '../utils/route-param.js';

const createStorySchema = z.object({
  mediaUrl: mediaUrlSchema,
  caption: z.string().max(200).optional(),
  mediaType: z.enum(['IMAGE', 'VIDEO', 'image', 'video']).optional(),
  mimeType: z.string().max(120).optional(),
  visibility: z.enum(['PUBLIC', 'FRIENDS', 'DEPARTMENT', 'PRIVATE']).optional(),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
});

export const storiesRouter = Router();

storiesRouter.use(authenticate, requireRoles('STUDENT', 'STAFF', 'SUPER_ADMIN'));

storiesRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    console.info('[story] GET /api/stories', { userId: req.user!.id });
    const stories = await getActiveStories(req.user!.id, req.user!.departmentId);
    res.json({ success: true, data: stories });
  } catch (error) {
    console.error('[story] GET /api/stories FAILED', error);
    next(error);
  }
});

/**
 * Preferred production path: multipart file + caption.
 * Stores media then inserts Story in one request (atomic from client POV).
 */
storiesRouter.post('/upload', (req: AuthRequest, res, next) => {
  upload.single('file')(req, res, async (err: unknown) => {
    try {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          throw new AppError(413, 'Story media too large (max 500MB video / 20MB image)');
        }
        throw new AppError(400, err.message);
      }
      if (err) throw err;

      const file = req.file;
      if (!file) {
        throw new AppError(400, 'No file uploaded. Use multipart field name "file".');
      }

      const caption =
        typeof req.body?.caption === 'string' ? req.body.caption : undefined;
      const visibility =
        typeof req.body?.visibility === 'string' ? req.body.visibility : undefined;

      const story = await createStoryWithFile(req.user!.id, file, { caption, visibility });
      res.status(201).json({ success: true, data: story });
    } catch (error) {
      console.error('[story] POST /api/stories/upload FAILED', error);
      next(error);
    }
  });
});

/** JSON path: media already uploaded via /api/uploads */
storiesRouter.post('/', (req: AuthRequest, res, next) => {
  // Content-Type multipart → treat as upload for convenience
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    upload.single('file')(req, res, async (err: unknown) => {
      try {
        if (err instanceof multer.MulterError) {
          throw new AppError(400, err.message);
        }
        if (err) throw err;
        if (!req.file) {
          throw new AppError(400, 'No file uploaded');
        }
        const story = await createStoryWithFile(req.user!.id, req.file, {
          caption: typeof req.body?.caption === 'string' ? req.body.caption : undefined,
          visibility: typeof req.body?.visibility === 'string' ? req.body.visibility : undefined,
        });
        res.status(201).json({ success: true, data: story });
      } catch (error) {
        next(error);
      }
    });
    return;
  }

  validateBody(createStorySchema)(req, res, async (validationErr?: unknown) => {
    if (validationErr) {
      next(validationErr);
      return;
    }
    try {
      const body = req.body as z.infer<typeof createStorySchema>;
      console.info('[story] POST /api/stories (JSON)', {
        userId: req.user!.id,
        mediaUrl: body.mediaUrl?.slice(0, 80),
        mediaType: body.mediaType,
      });
      const story = await createStory(req.user!.id, {
        mediaUrl: body.mediaUrl,
        caption: body.caption,
        mediaType: body.mediaType?.toUpperCase(),
        mimeType: body.mimeType,
        visibility: body.visibility,
      });
      res.status(201).json({ success: true, data: story });
    } catch (error) {
      console.error('[story] POST /api/stories FAILED', error);
      next(error);
    }
  });
});

// Static path segments before /:storyId
storiesRouter.post('/mute/:userId', async (req: AuthRequest, res, next) => {
  try {
    const data = await muteUserStories(req.user!.id, routeParam(req.params.userId));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

storiesRouter.delete('/:storyId', async (req: AuthRequest, res, next) => {
  try {
    const data = await deleteStoryOwned(
      { id: req.user!.id, role: req.user!.role },
      routeParam(req.params.storyId),
      getRequestMeta(req),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

storiesRouter.post('/:storyId/hide', async (req: AuthRequest, res, next) => {
  try {
    const data = await hideStory(req.user!.id, routeParam(req.params.storyId));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

storiesRouter.post(
  '/:storyId/report',
  validateBody(
    z.object({
      reason: z.string().min(1).max(40),
      details: z.string().max(2000).optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await reportStory(
        req.user!.id,
        routeParam(req.params.storyId),
        req.body.reason,
        req.body.details,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);
