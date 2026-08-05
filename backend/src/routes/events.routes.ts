import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requirePasswordReady, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import { routeParam } from '../utils/route-param.js';
import {
  createPersonalEvent,
  deletePersonalEvent,
  getEventDetail,
  getUnifiedCalendar,
  joinEvent,
  leaveEvent,
  listPersonalEvents,
  listPublishedEvents,
  toggleBookmark,
  toggleInterest,
  updatePersonalEvent,
} from '../services/events.service.js';

const router = Router();
router.use(authenticate, requirePasswordReady, requireRoles('STUDENT', 'STAFF'));

router.get('/', async (req: AuthRequest, res, next) => {
  try {
    const data = await listPublishedEvents(req.user!.id, req.user!.departmentId, {
      search: req.query.search as string | undefined,
      category: req.query.category as string | undefined,
      filter: req.query.filter as string | undefined,
      status: req.query.status as string | undefined,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/calendar', async (req: AuthRequest, res, next) => {
  try {
    const data = await getUnifiedCalendar(
      req.user!.id,
      req.user!.departmentId,
      req.query.from as string | undefined,
      req.query.to as string | undefined,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/personal', async (req: AuthRequest, res, next) => {
  try {
    const data = await listPersonalEvents(
      req.user!.id,
      req.query.from as string | undefined,
      req.query.to as string | undefined,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

const personalBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  type: z
    .enum(['REMINDER', 'ASSIGNMENT', 'MEETING', 'PROJECT', 'BIRTHDAY', 'PRACTICE', 'OTHER'])
    .optional(),
  startsAt: z.string().min(1),
  endsAt: z.string().optional().nullable(),
  reminderOffset: z.enum(['none', '30m', '1h', '2h', '1d']).optional().nullable(),
  reminderAt: z.string().optional().nullable(),
});

router.post(
  '/personal',
  validateBody(personalBodySchema),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await createPersonalEvent(req.user!.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/personal/:id',
  validateBody(personalBodySchema.partial()),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await updatePersonalEvent(
        req.user!.id,
        routeParam(req.params.id),
        req.body,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.delete('/personal/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = await deletePersonalEvent(req.user!.id, routeParam(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = await getEventDetail(
      routeParam(req.params.id),
      req.user!.id,
      req.user!.departmentId,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/join', async (req: AuthRequest, res, next) => {
  try {
    const data = await joinEvent(
      routeParam(req.params.id),
      req.user!.id,
      req.user!.departmentId,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/leave', async (req: AuthRequest, res, next) => {
  try {
    const data = await leaveEvent(routeParam(req.params.id), req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/interest', async (req: AuthRequest, res, next) => {
  try {
    const data = await toggleInterest(
      routeParam(req.params.id),
      req.user!.id,
      req.user!.departmentId,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/:id/bookmark', async (req: AuthRequest, res, next) => {
  try {
    const data = await toggleBookmark(
      routeParam(req.params.id),
      req.user!.id,
      req.user!.departmentId,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export const eventsRouter = router;
