import { Router } from 'express';
import { authenticate, requirePasswordReady, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { searchStudents, unifiedSearch } from '../services/search.service.js';
import { AppError } from '../utils/errors.js';

export const searchRouter = Router();

searchRouter.use(authenticate, requirePasswordReady, requireRoles('STUDENT', 'STAFF'));

/** Unified Instagram-style search */
searchRouter.get('/', async (req: AuthRequest, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const typeRaw = typeof req.query.type === 'string' ? req.query.type : 'all';
    const type = (['all', 'students', 'communities', 'events'].includes(typeRaw)
      ? typeRaw
      : 'all') as 'all' | 'students' | 'communities' | 'events';
    const department = typeof req.query.department === 'string' ? req.query.department : undefined;
    const year =
      typeof req.query.year === 'string' && Number(req.query.year)
        ? Number(req.query.year)
        : undefined;
    const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : 'az';
    const sort = (['az', 'recent', 'active'].includes(sortRaw) ? sortRaw : 'az') as
      | 'az'
      | 'recent'
      | 'active';
    const limit =
      typeof req.query.limit === 'string' && Number(req.query.limit)
        ? Number(req.query.limit)
        : 24;

    const data = await unifiedSearch(req.user!.id, {
      q,
      type,
      department,
      year,
      sort,
      limit,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

searchRouter.get('/students', async (req: AuthRequest, res, next) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    if (q.trim().length < 1) {
      throw new AppError(400, 'Search query required');
    }
    const department = typeof req.query.department === 'string' ? req.query.department : undefined;
    const year =
      typeof req.query.year === 'string' && Number(req.query.year)
        ? Number(req.query.year)
        : undefined;
    const sort = typeof req.query.sort === 'string' ? req.query.sort : 'az';
    const results = await searchStudents(req.user!.id, q, 30, { department, year, sort });
    res.json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
});
