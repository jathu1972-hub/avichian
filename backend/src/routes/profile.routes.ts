import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { sanitizeText } from '@avichian/shared';
import { prisma } from '../lib/prisma.js';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { areFriends } from '../services/friends.service.js';
import { toPublicUser } from '../services/user.mapper.js';
import { AppError } from '../utils/errors.js';
import { listUserSessions } from '../services/session.service.js';
import { coverPhotoUrlSchema, profilePhotoUrlSchema } from '../utils/media.js';
import { routeParam } from '../utils/route-param.js';
import {
  normalizeMimeType,
  storeUpload,
} from '../services/storage.service.js';

const updateProfileSchema = z.object({
  bio: z.string().max(300).optional(),
  profilePhotoUrl: profilePhotoUrlSchema,
  coverPhotoUrl: coverPhotoUrlSchema,
});

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

export const profileRouter = Router();

profileRouter.use(authenticate);

profileRouter.get('/me', async (req: AuthRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { profile: true, department: true },
    });

    if (!user) {
      throw new AppError(404, 'User not found');
    }

    res.json({ success: true, data: toPublicUser(user) });
  } catch (error) {
    next(error);
  }
});

profileRouter.patch(
  '/me',
  validateBody(updateProfileSchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = req.body as z.infer<typeof updateProfileSchema>;

      const user = await prisma.user.update({
        where: { id: req.user!.id },
        data: {
          profile: {
            update: {
              ...(data.bio !== undefined ? { bio: sanitizeText(data.bio, 300) } : {}),
              ...(data.profilePhotoUrl !== undefined
                ? { profilePhotoUrl: data.profilePhotoUrl }
                : {}),
              ...(data.coverPhotoUrl !== undefined
                ? { coverPhotoUrl: data.coverPhotoUrl }
                : {}),
            },
          },
        },
        include: { profile: true, department: true },
      });

      res.json({ success: true, data: toPublicUser(user) });
    } catch (error) {
      next(error);
    }
  },
);

async function handleProfileImageUpload(
  req: AuthRequest,
  res: import('express').Response,
  next: import('express').NextFunction,
  purpose: 'profile' | 'cover',
) {
  try {
    photoUpload.single('file')(req, res, async (err: unknown) => {
      try {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            throw new AppError(413, 'Photo must be 10MB or smaller', 'FILE_TOO_LARGE');
          }
          throw new AppError(400, err.message, 'UPLOAD_ERROR');
        }
        if (err) throw err;

        const file = req.file;
        if (!file) {
          throw new AppError(400, 'No file uploaded. Use multipart field name "file".');
        }

        const mimeType = normalizeMimeType(file.mimetype, file.originalname);
        const stored = await storeUpload({
          purpose,
          buffer: file.buffer,
          mimeType,
          originalName: file.originalname,
          userId: req.user!.id,
        });

        const user = await prisma.user.update({
          where: { id: req.user!.id },
          data: {
            profile: {
              update:
                purpose === 'profile'
                  ? { profilePhotoUrl: stored.url }
                  : { coverPhotoUrl: stored.url },
            },
          },
          include: { profile: true, department: true },
        });

        res.status(200).json({
          success: true,
          data: {
            user: toPublicUser(user),
            url: stored.url,
            storageUrl: stored.url,
            id: stored.id,
            fileName: stored.fileName,
            fileType: stored.mimeType,
            fileSize: stored.size,
            purpose: stored.purpose,
            createdAt: stored.createdAt.toISOString(),
          },
        });
      } catch (error) {
        next(error);
      }
    });
  } catch (error) {
    next(error);
  }
}

profileRouter.post('/photo', (req, res, next) =>
  handleProfileImageUpload(req as AuthRequest, res, next, 'profile'),
);
profileRouter.post('/cover', (req, res, next) =>
  handleProfileImageUpload(req as AuthRequest, res, next, 'cover'),
);

profileRouter.get('/login-history', async (req: AuthRequest, res, next) => {
  try {
    const history = await prisma.loginHistory.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        method: true,
        success: true,
        ipAddress: true,
        userAgent: true,
        reason: true,
        createdAt: true,
      },
    });
    res.json({ success: true, data: history });
  } catch (error) {
    next(error);
  }
});

profileRouter.get('/sessions', async (req: AuthRequest, res, next) => {
  try {
    const sessions = await listUserSessions(req.user!.id);
    res.json({ success: true, data: sessions });
  } catch (error) {
    next(error);
  }
});

profileRouter.get(
  '/:userId',
  requireRoles('STUDENT', 'STAFF'),
  async (req: AuthRequest, res, next) => {
    try {
      const userId = routeParam(req.params.userId);
      const user = await prisma.user.findFirst({
        where: {
          id: userId,
          role: 'STUDENT',
          deletedAt: null,
        },
        include: { profile: true, department: true },
      });

      if (!user) {
        throw new AppError(404, 'Student not found');
      }

      const isSelf = user.id === req.user!.id;
      const isFriend = isSelf ? false : await areFriends(req.user!.id, user.id);
      const sameDepartment = user.departmentId === req.user!.departmentId;

      const [postCount, friendCount] = await Promise.all([
        prisma.post.count({
          where: { authorId: user.id, deletedAt: null },
        }),
        prisma.friendRequest.count({
          where: {
            status: 'ACCEPTED',
            OR: [{ senderId: user.id }, { receiverId: user.id }],
          },
        }),
      ]);

      res.json({
        success: true,
        data: {
          ...toPublicUser(user),
          isSelf,
          isFriend,
          sameDepartment,
          postCount,
          friendCount,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
