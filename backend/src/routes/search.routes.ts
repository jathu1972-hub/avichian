import { Router } from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { searchStudents } from '../services/search.service.js';
import { AppError } from '../utils/errors.js';

export const searchRouter = Router();

searchRouter.use(authenticate, requireRoles('STUDENT', 'STAFF'));

searchRouter.get('/students', async (req: AuthRequest, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (q.trim().length < 2) {
      throw new AppError(400, 'Search query must be at least 2 characters');
    }
    const results = await searchStudents(req.user!.id, q);
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});