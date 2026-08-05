import { Router } from 'express';
import { authenticate, requirePasswordReady, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import {
  getStudentCalendar,
  getStudentCampusHome,
  getStudentNotifications,
  listStudentAnnouncements,
  listStudentEvents,
} from '../services/student-campus.service.js';

const router = Router();
router.use(authenticate, requirePasswordReady, requireRoles('STUDENT', 'STAFF'));

router.get('/home', async (req: AuthRequest, res, next) => {
  try {
    const data = await getStudentCampusHome(req.user!.id, req.user!.departmentId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/events', async (req: AuthRequest, res, next) => {
  try {
    // Prefer full campus events module; keep legacy department list as fallback shape
    const { listPublishedEvents } = await import('../services/events.service.js');
    const data = await listPublishedEvents(req.user!.id, req.user!.departmentId, {
      search: req.query.search as string | undefined,
      category: req.query.category as string | undefined,
      filter: req.query.filter as string | undefined,
    });
    res.json({ success: true, data });
  } catch (error) {
    try {
      const data = await listStudentEvents(req.user!.departmentId);
      res.json({ success: true, data: { items: data, featured: null, categories: [] } });
    } catch (e2) {
      next(error);
    }
  }
});

router.get('/announcements', async (req: AuthRequest, res, next) => {
  try {
    const data = await listStudentAnnouncements(req.user!.departmentId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/calendar', async (req: AuthRequest, res, next) => {
  try {
    const { getUnifiedCalendar } = await import('../services/events.service.js');
    const data = await getUnifiedCalendar(
      req.user!.id,
      req.user!.departmentId,
      req.query.from as string,
      req.query.to as string,
    );
    res.json({ success: true, data });
  } catch (error) {
    try {
      const data = await getStudentCalendar(
        req.user!.departmentId,
        req.query.from as string,
        req.query.to as string,
      );
      res.json({ success: true, data: { items: data } });
    } catch (e2) {
      next(error);
    }
  }
});

router.get('/notifications', async (req: AuthRequest, res, next) => {
  try {
    const data = await getStudentNotifications(req.user!.id);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/communities', async (req: AuthRequest, res, next) => {
  try {
    const { listCommunitiesForUser } = await import('../services/communities.service.js');
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

export const studentRouter = router;
