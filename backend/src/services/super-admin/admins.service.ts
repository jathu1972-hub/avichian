import {
  isValidEmail,
  isValidRegNo,
  normalizeEmail,
  normalizeMobile,
  normalizeName,
  normalizeRegNo,
} from '@avichian/shared';
import { prisma } from '../../lib/prisma.js';
import { encryptField, hashValue } from '../../utils/crypto.js';
import {
  assertPasswordsMatch,
  assertStrongPassword,
  hashPassword,
} from '../../utils/password.js';
import { AppError } from '../../utils/errors.js';
import { writeAuditLog } from '../audit.service.js';

/**
 * Create another Super Admin (only callable by an existing SUPER_ADMIN).
 * employeeId is stored as User.regNo (unique login identifier).
 */
export async function createSuperAdminAccount(
  data: {
    name: string;
    employeeId: string;
    email: string;
    mobile?: string | null;
    password: string;
    confirmPassword?: string;
  },
  creatorId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const employeeId = normalizeRegNo(data.employeeId);
  const email = normalizeEmail(data.email);
  const name = normalizeName(data.name);

  if (!isValidRegNo(employeeId)) {
    throw new AppError(400, 'Invalid employee ID (6–12 letters/numbers)', 'INVALID_EMPLOYEE_ID');
  }
  if (!name) throw new AppError(400, 'Full name is required');
  if (!isValidEmail(email)) throw new AppError(400, 'Invalid email', 'INVALID_EMAIL');

  assertStrongPassword(data.password);
  assertPasswordsMatch(data.password, data.confirmPassword);

  const rawMobile = data.mobile?.trim() ? normalizeMobile(data.mobile) : '';
  const hasMobile = rawMobile.length === 10;
  const mobileHash = hasMobile
    ? hashValue(rawMobile)
    : hashValue(`__nomobile__:admin:${employeeId}`);
  const mobileEnc = encryptField(hasMobile ? rawMobile : `NONE:${employeeId}`);

  const exists = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { regNo: employeeId },
        { email },
        ...(hasMobile ? [{ mobileHash }] : []),
      ],
    },
  });
  if (exists) {
    if (exists.regNo === employeeId) {
      throw new AppError(409, 'Employee ID already in use', 'DUPLICATE_EMPLOYEE_ID');
    }
    if (exists.email === email) {
      throw new AppError(409, 'Email already in use', 'DUPLICATE_EMAIL');
    }
    throw new AppError(409, 'Mobile already in use', 'DUPLICATE_MOBILE');
  }

  const passwordHash = await hashPassword(data.password);

  const department = await prisma.department.upsert({
    where: { name: 'Administration' },
    update: {},
    create: { name: 'Administration', code: 'ADMIN' },
  });

  const user = await prisma.$transaction(async (tx) => {
    return tx.user.create({
      data: {
        regNo: employeeId,
        email,
        passwordHash,
        mobileHash,
        mobileEnc,
        role: 'SUPER_ADMIN',
        departmentId: department.id,
        accountStatus: 'ACTIVE',
        forcePasswordChange: false,
        failedLoginCount: 0,
        lockedUntil: null,
        profile: {
          create: {
            name,
            privacy: 'PRIVATE',
          },
        },
        admin: {
          create: {},
        },
      },
      include: { profile: true, admin: true },
    });
  });

  await writeAuditLog({
    userId: creatorId,
    action: 'USER_CREATED',
    resourceType: 'user',
    resourceId: user.id,
    metadata: {
      role: 'SUPER_ADMIN',
      employeeId,
      name,
      email,
    },
    ...meta,
  });

  return {
    id: user.id,
    employeeId: user.regNo,
    name: user.profile?.name,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
    canLoginImmediately: true,
    loginHint: 'New Super Admin can log in with Employee ID + Email + Password',
  };
}

export async function listSuperAdmins() {
  const items = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { profile: true, admin: true },
  });
  return items.map((u) => ({
    id: u.id,
    employeeId: u.regNo,
    name: u.profile?.name ?? u.regNo,
    email: u.email,
    status: u.accountStatus,
    mfaEnabled: u.mfaEnabled,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  }));
}

/** Repair accounts that have Admin row but wrong role (legacy bug). */
export async function repairAdminRoles() {
  const fixed = await prisma.user.updateMany({
    where: {
      role: { not: 'SUPER_ADMIN' },
      admin: { isNot: null },
      deletedAt: null,
    },
    data: { role: 'SUPER_ADMIN' },
  });
  return { fixed: fixed.count };
}
