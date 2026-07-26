import { normalizeEmail, normalizeRegNo } from '@avichian/shared';
import { prisma } from '../../lib/prisma.js';
import { encryptField, hashValue } from '../../utils/crypto.js';
import { hashPassword } from '../../utils/password.js';
import { AppError } from '../../utils/errors.js';
import { writeAuditLog } from '../audit.service.js';

export async function listStaff(params: { search?: string; departmentId?: string }) {
  const search = params.search?.trim();
  const staff = await prisma.staff.findMany({
    where: {
      ...(params.departmentId ? { departmentId: params.departmentId } : {}),
      ...(search
        ? {
            OR: [
              { staffId: { contains: search, mode: 'insensitive' } },
              { user: { email: { contains: search, mode: 'insensitive' } } },
              { user: { profile: { name: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    },
    include: {
      user: { include: { profile: true, department: true } },
      department: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  return staff.map((s) => ({
    id: s.id,
    userId: s.userId,
    staffId: s.staffId,
    name: s.user.profile?.name ?? s.staffId,
    email: s.user.email,
    department: s.department.name,
    departmentId: s.departmentId,
    title: s.title,
    status: s.user.accountStatus,
    active: s.active,
    online: s.user.online,
    lastLoginAt: s.user.lastLoginAt,
  }));
}

export async function createStaff(
  data: {
    staffId: string;
    name: string;
    email: string;
    password: string;
    departmentId: string;
    title?: string;
    mobile?: string;
  },
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const staffId = normalizeRegNo(data.staffId);
  const email = normalizeEmail(data.email);
  const existing = await prisma.staff.findUnique({ where: { staffId } });
  if (existing) throw new AppError(409, 'Staff ID already exists');

  const mobile = data.mobile ?? '9000000099';
  const user = await prisma.user.create({
    data: {
      regNo: staffId,
      email,
      passwordHash: await hashPassword(data.password),
      mobileHash: hashValue(mobile),
      mobileEnc: encryptField(mobile),
      role: 'STAFF',
      departmentId: data.departmentId,
      profile: { create: { name: data.name } },
      staff: {
        create: {
          staffId,
          departmentId: data.departmentId,
          title: data.title,
        },
      },
    },
    include: { staff: true, profile: true },
  });

  await writeAuditLog({
    userId: adminId,
    action: 'USER_CREATED',
    resourceType: 'staff',
    resourceId: user.id,
    metadata: { staffId, action: 'create', verified: true },
    ...meta,
  });

  return user;
}

export async function suspendStaff(
  staffRecordId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
  reason?: string,
) {
  const staff = await prisma.staff.findUnique({ where: { id: staffRecordId } });
  if (!staff) throw new AppError(404, 'Staff not found');
  await prisma.user.update({
    where: { id: staff.userId },
    data: { accountStatus: 'SUSPENDED', suspendedAt: new Date() },
  });
  await prisma.staff.update({ where: { id: staff.id }, data: { active: false } });
  await prisma.session.updateMany({
    where: { userId: staff.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAuditLog({
    userId: adminId,
    action: 'USER_SUSPENDED',
    resourceType: 'staff',
    resourceId: staff.userId,
    metadata: { staffId: staff.staffId, reason },
    ...meta,
  });
  return { message: 'Staff suspended' };
}

export async function activateStaff(
  staffRecordId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const staff = await prisma.staff.findUnique({ where: { id: staffRecordId } });
  if (!staff) throw new AppError(404, 'Staff not found');
  await prisma.user.update({
    where: { id: staff.userId },
    data: { accountStatus: 'ACTIVE', suspendedAt: null, lockedUntil: null, failedLoginCount: 0 },
  });
  await prisma.staff.update({ where: { id: staff.id }, data: { active: true } });
  await writeAuditLog({
    userId: adminId,
    action: 'USER_ACTIVATED',
    resourceType: 'staff',
    resourceId: staff.userId,
    metadata: { staffId: staff.staffId },
    ...meta,
  });
  return { message: 'Staff activated' };
}

export async function resetStaffPassword(
  staffRecordId: string,
  password: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  if (password.length < 8) throw new AppError(400, 'Password too short');
  const staff = await prisma.staff.findUnique({ where: { id: staffRecordId } });
  if (!staff) throw new AppError(404, 'Staff not found');
  await prisma.user.update({
    where: { id: staff.userId },
    data: {
      passwordHash: await hashPassword(password),
      forcePasswordChange: true,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  await prisma.session.updateMany({
    where: { userId: staff.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAuditLog({
    userId: adminId,
    action: 'PASSWORD_RESET',
    resourceType: 'staff',
    resourceId: staff.userId,
    metadata: { staffId: staff.staffId, forceChange: true },
    ...meta,
  });
  return { message: 'Staff password reset', temporaryPassword: password };
}