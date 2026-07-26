import { Router } from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import {
  getStudentCalendar,
  getStudentCampusHome,
  getStudentNotifications,
  listCommunities,
  listStudentAnnouncements,
  listStudentEvents,
} from '../services/student-campus.service.js';

const router = Router();
router.use(authenticate, requireRoles('STUDENT', 'STAFF'));

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
    const data = await listStudentEvents(req.user!.departmentId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
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
    const data = await getStudentCalendar(
      req.user!.departmentId,
      req.query.from as string,
      req.query.to as string,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
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
    const data = await listCommunities(req.user!.departmentId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export const studentRouter = router;
