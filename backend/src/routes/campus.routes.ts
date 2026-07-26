/**
 * Campus APIs used by the AVICHIAN app for both STUDENT and STAFF.
 * Staff-only actions: create announcements/events, import roster.
 */
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { getRequestMeta } from '../middleware/request-meta.js';
import { prisma } from '../lib/prisma.js';
import { importStudentMasterFromCsv } from '../services/student-master.service.js';
import { writeAuditLog } from '../services/audit.service.js';
import { AppError } from '../utils/errors.js';
import { createReport } from '../services/super-admin/moderation.service.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
export const campusRouter = Router();
campusRouter.use(authenticate, requireRoles('STUDENT', 'STAFF'));

campusRouter.post(
  '/reports',
  validateBody(
    z.object({
      targetType: z.enum(['POST', 'STORY', 'MESSAGE', 'USER', 'COMMENT']),
      targetId: z.string().min(1),
      targetUserId: z.string().uuid().optional(),
      reason: z.enum([
        'SPAM',
        'HARASSMENT',
        'BULLYING',
        'VIOLENCE',
        'FAKE_ACCOUNT',
        'ADULT_CONTENT',
        'ILLEGAL_CONTENT',
        'SCAM',
        'INAPPROPRIATE',
        'OTHER',
      ]),
      details: z.string().optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await createReport({
        reporterId: req.user!.id,
        ...req.body,
      });
      res.json({ success: true, data: { id: data.id } });
    } catch (error) {
      next(error);
    }
  },
);

campusRouter.get('/me', async (req: AuthRequest, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        id: req.user!.id,
        role: req.user!.role,
        departmentId: req.user!.departmentId,
        isStaff: req.user!.role === 'STAFF',
        isStudent: req.user!.role === 'STUDENT',
      },
    });
  } catch (error) {
    next(error);
  }
});

/** Staff: create department announcement */
campusRouter.post(
  '/announcements',
  requireRoles('STAFF'),
  validateBody(
    z.object({
      title: z.string().min(1),
      body: z.string().min(1),
      visibility: z.string().optional(),
      year: z.number().int().optional(),
      section: z.string().optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await prisma.announcement.create({
        data: {
          departmentId: req.user!.departmentId,
          title: req.body.title,
          body: req.body.body,
          visibility: req.body.visibility ?? 'DEPARTMENT',
          year: req.body.year,
          section: req.body.section,
          createdById: req.user!.id,
        },
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

campusRouter.get('/announcements', async (req: AuthRequest, res, next) => {
  try {
    const data = await prisma.announcement.findMany({
      where: { departmentId: req.user!.departmentId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/** Staff: create department event */
campusRouter.post(
  '/events',
  requireRoles('STAFF'),
  validateBody(
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      startsAt: z.string(),
      venue: z.string().optional(),
      maxParticipants: z.number().int().optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await prisma.departmentEvent.create({
        data: {
          departmentId: req.user!.departmentId,
          name: req.body.name,
          description: req.body.description,
          startsAt: new Date(req.body.startsAt),
          venue: req.body.venue,
          maxParticipants: req.body.maxParticipants,
          published: true,
          createdById: req.user!.id,
        },
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

campusRouter.get('/events', async (req: AuthRequest, res, next) => {
  try {
    const data = await prisma.departmentEvent.findMany({
      where: { departmentId: req.user!.departmentId, published: true },
      orderBy: { startsAt: 'asc' },
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

/** Staff: import student master CSV for their department */
campusRouter.post(
  '/students/import',
  requireRoles('STAFF'),
  upload.single('file'),
  async (req: AuthRequest, res, next) => {
    try {
      const csvText =
        req.file?.buffer.toString('utf-8') ??
        (typeof req.body?.csv === 'string' ? req.body.csv : null);
      if (!csvText) throw new AppError(400, 'CSV file or csv text required');

      const department = await prisma.department.findUnique({
        where: { id: req.user!.departmentId },
      });
      const result = await importStudentMasterFromCsv(csvText, {
        departmentScope: department?.name,
      });

      await writeAuditLog({
        userId: req.user!.id,
        action: 'STUDENT_MASTER_IMPORT',
        metadata: { ...result, source: 'staff_app_csv' },
        ...getRequestMeta(req),
      });

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);
