import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/errors.js';
import { writeAuditLog } from '../audit.service.js';

export async function listDepartments() {
  const departments = await prisma.department.findMany({
    orderBy: { name: 'asc' },
    include: {
      _count: {
        select: {
          users: true,
          studentMaster: true,
          staff: true,
        },
      },
    },
  });

  const studentCounts = await prisma.user.groupBy({
    by: ['departmentId'],
    where: { role: 'STUDENT', deletedAt: null },
    _count: true,
  });
  const studentMap = Object.fromEntries(studentCounts.map((s) => [s.departmentId, s._count]));

  return departments.map((d) => ({
    id: d.id,
    name: d.name,
    code: d.code,
    studentCount: studentMap[d.id] ?? 0,
    rosterCount: d._count.studentMaster,
    staffCount: d._count.staff,
    createdAt: d.createdAt,
  }));
}

export async function createDepartment(
  name: string,
  code: string | undefined,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const existing = await prisma.department.findUnique({ where: { name: name.trim() } });
  if (existing) throw new AppError(409, 'Department already exists');

  const codeBase =
    code?.trim().toUpperCase() ||
    name.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() ||
    'DEPT';

  let finalCode = codeBase;
  let n = 1;
  while (await prisma.department.findUnique({ where: { code: finalCode } })) {
    finalCode = `${codeBase}${n}`;
    n += 1;
  }

  const dept = await prisma.department.create({
    data: { name: name.trim(), code: finalCode },
  });

  await writeAuditLog({
    userId: adminId,
    action: 'STUDENT_MASTER_IMPORT',
    metadata: { action: 'create_department', name: dept.name },
    ...meta,
  });

  return dept;
}

export async function seedDefaultDepartments() {
  const defaults = [
    { name: 'Visual Communication', code: 'VCM' },
    { name: 'Computer Science', code: 'CS' },
    { name: 'Commerce', code: 'COM' },
  ];
  for (const d of defaults) {
    await prisma.department.upsert({
      where: { name: d.name },
      update: {},
      create: d,
    });
  }
}
