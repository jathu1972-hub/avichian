import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { requireSuperAdmin } from '../middleware/super-admin.js';
import { validateBody } from '../middleware/validate.js';
import { getRequestMeta } from '../middleware/request-meta.js';
import { getDashboardStats } from '../services/super-admin/dashboard.service.js';
import {
  activateStudent,
  addMasterStudent,
  banStudent,
  createStudentAccount,
  getStudentAdminProfile,
  listMasterStudents,
  listStudents,
  resetStudentPassword,
  revokeAllUserSessions,
  softDeleteStudent,
  suspendStudent,
  unlockStudentAccount,
  updateStudent,
  warnStudent,
} from '../services/super-admin/students.service.js';
import {
  activateStaff,
  createStaff,
  listStaff,
  resetStaffPassword,
  suspendStaff,
} from '../services/super-admin/staff.service.js';
import {
  createDepartment,
  listDepartments,
  seedDefaultDepartments,
} from '../services/super-admin/departments.service.js';
import {
  createCollegeAnnouncement,
  createCollegeEvent,
  createReport,
  deleteAnnouncement,
  deleteEvent,
  listCollegeAnnouncements,
  listCollegeEvents,
  listPostsForModeration,
  listReports,
  resolveReport,
  restorePost,
  softDeletePost,
  softDeleteStory,
} from '../services/super-admin/moderation.service.js';
import { prisma } from '../lib/prisma.js';
import { importStudentMasterFromPayload } from '../services/student-master.service.js';
import { writeAuditLog } from '../services/audit.service.js';
import { routeParam } from '../utils/route-param.js';

const router = Router();
router.use(authenticate, requireSuperAdmin);

router.get('/dashboard/stats', async (_req, res, next) => {
  try {
    const data = await getDashboardStats();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ── Students ──────────────────────────────────────────────
router.get('/students', async (req, res, next) => {
  try {
    const data = await listStudents({
      search: req.query.search as string,
      departmentId: req.query.departmentId as string,
      page: Number(req.query.page ?? 1),
      limit: Number(req.query.limit ?? 50),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/students/master', async (req, res, next) => {
  try {
    const data = await listMasterStudents({
      search: req.query.search as string,
      departmentId: req.query.departmentId as string,
      page: Number(req.query.page ?? 1),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/students',
  validateBody(
    z.object({
      regNo: z.string().min(1),
      name: z.string().min(1),
      email: z.string().email(),
      mobile: z.string().min(10),
      departmentId: z.string().uuid(),
      year: z.number().int().optional(),
      password: z.string().min(8),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await createStudentAccount(req.body, req.user!.id, getRequestMeta(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.get('/students/:id/profile', async (req, res, next) => {
  try {
    const data = await getStudentAdminProfile(routeParam(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/students/:id', async (req, res, next) => {
  try {
    const data = await getStudentAdminProfile(routeParam(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.patch(
  '/students/:id',
  validateBody(
    z.object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      mobile: z.string().optional(),
      departmentId: z.string().uuid().optional(),
      year: z.number().int().nullable().optional(),
      verifiedBadge: z.boolean().optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await updateStudent(
        routeParam(req.params.id),
        req.body,
        req.user!.id,
        getRequestMeta(req),
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/students/master',
  validateBody(
    z.object({
      name: z.string(),
      reg_no: z.string(),
      mobile: z.string(),
      email: z.string().email(),
      department: z.string(),
      year: z.number().int(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const record = await addMasterStudent(req.body, req.user!.id, getRequestMeta(req));
      res.json({ success: true, data: record });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/students/master/import', async (req: AuthRequest, res, next) => {
  try {
    const result = await importStudentMasterFromPayload(req.body.students);
    await writeAuditLog({
      userId: req.user!.id,
      action: 'STUDENT_MASTER_IMPORT',
      metadata: result,
      ...getRequestMeta(req),
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/students/:id/suspend',
  validateBody(z.object({ reason: z.string().optional() }).optional()),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await suspendStudent(
        routeParam(req.params.id),
        req.user!.id,
        getRequestMeta(req),
        req.body?.reason,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/students/:id/activate', async (req: AuthRequest, res, next) => {
  try {
    const result = await activateStudent(
      routeParam(req.params.id),
      req.user!.id,
      getRequestMeta(req),
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/students/:id/unlock',
  validateBody(z.object({ reason: z.string().max(500).optional() }).optional()),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await unlockStudentAccount(
        routeParam(req.params.id),
        req.user!.id,
        getRequestMeta(req),
        req.body?.reason,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/students/:id/reset-password',
  validateBody(z.object({ password: z.string().min(8) })),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await resetStudentPassword(
        routeParam(req.params.id),
        req.body.password,
        req.user!.id,
        getRequestMeta(req),
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/students/:id/logout-all', async (req: AuthRequest, res, next) => {
  try {
    const result = await revokeAllUserSessions(
      routeParam(req.params.id),
      req.user!.id,
      getRequestMeta(req),
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/students/:id/warn',
  validateBody(z.object({ reason: z.string().min(1).max(2000) })),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await warnStudent(
        routeParam(req.params.id),
        req.user!.id,
        getRequestMeta(req),
        req.body.reason,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/students/:id/ban',
  validateBody(z.object({ reason: z.string().min(1).max(2000) })),
  async (req: AuthRequest, res, next) => {
    try {
      const result = await banStudent(
        routeParam(req.params.id),
        req.user!.id,
        getRequestMeta(req),
        req.body.reason,
      );
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);

router.delete('/students/:id', async (req: AuthRequest, res, next) => {
  try {
    const result = await softDeleteStudent(
      routeParam(req.params.id),
      req.user!.id,
      getRequestMeta(req),
      typeof req.query.reason === 'string' ? req.query.reason : undefined,
    );
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// ── Staff ─────────────────────────────────────────────────
router.get('/staff', async (req, res, next) => {
  try {
    const data = await listStaff({
      search: req.query.search as string,
      departmentId: req.query.departmentId as string,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/staff',
  validateBody(
    z.object({
      staffId: z.string(),
      name: z.string(),
      email: z.string().email(),
      password: z.string().min(8),
      departmentId: z.string().uuid(),
      title: z.string().optional(),
      mobile: z.string().optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const user = await createStaff(req.body, req.user!.id, getRequestMeta(req));
      res.json({ success: true, data: { id: user.id, staffId: user.staff?.staffId } });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/staff/:id/suspend',
  validateBody(z.object({ reason: z.string().optional() }).optional()),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await suspendStaff(
        routeParam(req.params.id),
        req.user!.id,
        getRequestMeta(req),
        req.body?.reason,
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/staff/:id/activate', async (req: AuthRequest, res, next) => {
  try {
    const data = await activateStaff(
      routeParam(req.params.id),
      req.user!.id,
      getRequestMeta(req),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/staff/:id/reset-password',
  validateBody(z.object({ password: z.string().min(8) })),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await resetStaffPassword(
        routeParam(req.params.id),
        req.body.password,
        req.user!.id,
        getRequestMeta(req),
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// ── Departments ───────────────────────────────────────────
router.get('/departments', async (_req, res, next) => {
  try {
    const data = await listDepartments();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/departments',
  validateBody(z.object({ name: z.string(), code: z.string().optional() })),
  async (req: AuthRequest, res, next) => {
    try {
      const dept = await createDepartment(
        req.body.name,
        req.body.code,
        req.user!.id,
        getRequestMeta(req),
      );
      res.json({ success: true, data: dept });
    } catch (error) {
      next(error);
    }
  },
);

router.post('/departments/seed-defaults', async (req: AuthRequest, res, next) => {
  try {
    await seedDefaultDepartments();
    res.json({ success: true, message: 'Default departments seeded' });
  } catch (error) {
    next(error);
  }
});

// ── Content moderation ────────────────────────────────────
router.get('/posts', async (req, res, next) => {
  try {
    const data = await listPostsForModeration({
      search: req.query.search as string,
      includeDeleted: req.query.includeDeleted === 'true',
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/posts/:id/delete', async (req: AuthRequest, res, next) => {
  try {
    const data = await softDeletePost(
      routeParam(req.params.id),
      req.user!.id,
      getRequestMeta(req),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/posts/:id/restore', async (req: AuthRequest, res, next) => {
  try {
    const data = await restorePost(
      routeParam(req.params.id),
      req.user!.id,
      getRequestMeta(req),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.delete('/stories/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = await softDeleteStory(
      routeParam(req.params.id),
      req.user!.id,
      getRequestMeta(req),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ── Reports ───────────────────────────────────────────────
router.get('/reports', async (req, res, next) => {
  try {
    const status = req.query.status as 'OPEN' | 'REVIEWING' | 'ACTIONED' | 'CLOSED' | undefined;
    const data = await listReports(status);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/reports/:id/resolve',
  validateBody(
    z.object({
      status: z.enum(['OPEN', 'REVIEWING', 'ACTIONED', 'CLOSED']),
      adminNotes: z.string().optional(),
      action: z.enum(['delete_post', 'suspend_user', 'warn', 'none']).optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await resolveReport(
        routeParam(req.params.id),
        req.user!.id,
        req.body,
        getRequestMeta(req),
      );
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

// ── Announcements & Events ────────────────────────────────
router.get('/announcements', async (_req, res, next) => {
  try {
    const data = await listCollegeAnnouncements();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/announcements',
  validateBody(
    z.object({
      title: z.string().min(1),
      body: z.string().min(1),
      departmentId: z.string().uuid().optional(),
      visibility: z.string().optional(),
      year: z.number().int().optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await createCollegeAnnouncement(req.body, req.user!.id, getRequestMeta(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.delete('/announcements/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = await deleteAnnouncement(
      routeParam(req.params.id),
      req.user!.id,
      getRequestMeta(req),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/events', async (_req, res, next) => {
  try {
    const data = await listCollegeEvents();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post(
  '/events',
  validateBody(
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      startsAt: z.string(),
      venue: z.string().optional(),
      departmentId: z.string().uuid().optional(),
    }),
  ),
  async (req: AuthRequest, res, next) => {
    try {
      const data = await createCollegeEvent(req.body, req.user!.id, getRequestMeta(req));
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  },
);

router.delete('/events/:id', async (req: AuthRequest, res, next) => {
  try {
    const data = await deleteEvent(
      routeParam(req.params.id),
      req.user!.id,
      getRequestMeta(req),
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// ── Audit ─────────────────────────────────────────────────
router.get('/audit-logs', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 300);
    const logs = await prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            regNo: true,
            email: true,
            role: true,
            profile: { select: { name: true } },
          },
        },
      },
    });
    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
});

// ── Global search ─────────────────────────────────────────
router.get('/search', async (req, res, next) => {
  try {
    const q = (req.query.q as string)?.trim();
    if (!q || q.length < 2) {
      res.json({ success: true, data: { students: [], staff: [], departments: [] } });
      return;
    }

    const [students, staff, departments] = await Promise.all([
      prisma.user.findMany({
        where: {
          role: 'STUDENT',
          deletedAt: null,
          OR: [
            { regNo: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { profile: { name: { contains: q, mode: 'insensitive' } } },
          ],
        },
        take: 15,
        include: { profile: true, department: true },
      }),
      prisma.staff.findMany({
        where: {
          OR: [
            { staffId: { contains: q, mode: 'insensitive' } },
            { user: { email: { contains: q, mode: 'insensitive' } } },
            { user: { profile: { name: { contains: q, mode: 'insensitive' } } } },
          ],
        },
        take: 15,
        include: { user: { include: { profile: true } }, department: true },
      }),
      prisma.department.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        take: 10,
      }),
    ]);

    res.json({
      success: true,
      data: {
        students: students.map((s) => ({
          id: s.id,
          regNo: s.regNo,
          name: s.profile?.name,
          department: s.department.name,
          email: s.email,
          status: s.accountStatus,
        })),
        staff: staff.map((s) => ({
          id: s.id,
          staffId: s.staffId,
          name: s.user.profile?.name,
          department: s.department.name,
          email: s.user.email,
        })),
        departments,
      },
    });
  } catch (error) {
    next(error);
  }
});

export const superAdminRouter = router;

// Student-app report endpoint is separate; export createReport for app use
export { createReport };
