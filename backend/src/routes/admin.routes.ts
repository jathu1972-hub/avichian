import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { validateBody } from '../middleware/validate.js';
import {
  importStudentMasterFromFile,
  importStudentMasterFromPayload,
} from '../services/student-master.service.js';
import { writeAuditLog } from '../services/audit.service.js';
import { getRequestMeta } from '../middleware/request-meta.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';

const importSchema = z.object({
  students: z.array(
    z.object({
      name: z.string(),
      reg_no: z.string(),
      mobile: z.string(),
      email: z.string().email(),
      department: z.string(),
      year: z.number().int(),
      role: z.string().optional(),
      verified: z.boolean().optional(),
    }),
  ),
});

/** Shared admin tools: Super Admin + Staff (in AVICHIAN app). */
export const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(requireRoles('STAFF', 'SUPER_ADMIN'));

async function assertDepartmentScope(req: AuthRequest, departmentName: string) {
  if (req.user!.role === 'SUPER_ADMIN') return;
  const dept = await prisma.department.findUnique({ where: { id: req.user!.departmentId } });
  if (!dept || dept.name.toLowerCase() !== departmentName.trim().toLowerCase()) {
    throw new AppError(403, 'Staff can only manage students in their own department');
  }
}

adminRouter.get('/audit-logs', requireRoles('SUPER_ADMIN'), async (req: AuthRequest, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const logs = await prisma.auditLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { regNo: true, email: true, role: true } } },
    });
    res.json({ success: true, data: logs });
  } catch (error) {
    next(error);
  }
});

adminRouter.post('/student-master/import-file', async (req: AuthRequest, res, next) => {
  try {
    const result = await importStudentMasterFromFile();
    await writeAuditLog({
      userId: req.user!.id,
      action: 'STUDENT_MASTER_IMPORT',
      metadata: { ...result, source: 'file' },
      ...getRequestMeta(req),
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

adminRouter.post(
  '/student-master/import',
  validateBody(importSchema),
  async (req: AuthRequest, res, next) => {
    try {
      if (req.user!.role === 'STAFF') {
        const depts = new Set(
          (req.body.students as { department: string }[]).map((s) => s.department.trim().toLowerCase()),
        );
        for (const d of depts) {
          await assertDepartmentScope(req, d);
        }
      }
      const result = await importStudentMasterFromPayload(req.body.students);
      await writeAuditLog({
        userId: req.user!.id,
        action: 'STUDENT_MASTER_IMPORT',
        metadata: { ...result, source: 'json' },
        ...getRequestMeta(req),
      });
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  },
);
