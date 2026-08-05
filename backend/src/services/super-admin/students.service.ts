import {
  isValidEmail,
  isValidRegNo,
  normalizeEmail,
  normalizeMobile,
  normalizeName,
  normalizeRegNo,
} from '@avichian/shared';
import { prisma } from '../../lib/prisma.js';
import { decryptField, encryptField, hashValue } from '../../utils/crypto.js';
import {
  assertPasswordsMatch,
  assertStrongPassword,
  hashPassword,
} from '../../utils/password.js';
import { AppError } from '../../utils/errors.js';
import { writeAuditLog } from '../audit.service.js';
import { env } from '../../config/env.js';

export async function listStudents(params: {
  search?: string;
  departmentId?: string;
  page?: number;
  limit?: number;
}) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 25, 100);
  const skip = (page - 1) * limit;
  const search = params.search?.trim();

  const where = {
    role: 'STUDENT' as const,
    deletedAt: null,
    ...(params.departmentId ? { departmentId: params.departmentId } : {}),
    ...(search
      ? {
          OR: [
            { regNo: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { profile: { name: { contains: search, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        profile: true,
        department: true,
        _count: { select: { sessions: true, loginHistory: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    items: items.map((u) => ({
      id: u.id,
      regNo: u.regNo,
      name: u.profile?.name ?? u.regNo,
      email: u.email,
      department: u.department.name,
      departmentId: u.departmentId,
      year: u.profile?.year,
      section: u.profile?.section ?? null,
      status: u.accountStatus,
      online: u.online,
      lastLoginAt: u.lastLoginAt,
      lastSeen: u.lastSeen,
      failedLoginCount: u.failedLoginCount,
      lockedUntil: u.lockedUntil,
      lastFailedLoginAt: (u as { lastFailedLoginAt?: Date | null }).lastFailedLoginAt ?? null,
      isLocked: Boolean(u.lockedUntil && u.lockedUntil > new Date()),
      sessionCount: u._count.sessions,
      loginCount: u._count.loginHistory,
      createdAt: u.createdAt,
    })),
    total,
    page,
    limit,
  };
}

export async function listMasterStudents(params: {
  search?: string;
  departmentId?: string;
  page?: number;
  limit?: number;
}) {
  const page = params.page ?? 1;
  const limit = Math.min(params.limit ?? 25, 100);
  const skip = (page - 1) * limit;
  const search = params.search?.trim();

  const where = {
    verified: true,
    ...(params.departmentId ? { departmentId: params.departmentId } : {}),
    ...(search
      ? {
          OR: [
            { regNo: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.studentMaster.findMany({
      where,
      skip,
      take: limit,
      orderBy: { regNo: 'asc' },
      include: { department: true, user: { select: { id: true } } },
    }),
    prisma.studentMaster.count({ where }),
  ]);

  return {
    items: items.map((s) => ({
      id: s.id,
      regNo: s.regNo,
      name: s.name,
      email: s.email,
      collegeEmail: s.email,
      department: s.department.name,
      departmentId: s.departmentId,
      year: s.year,
      section: s.section,
      status: s.status,
      accountCreated: s.accountCreated,
      verified: s.verified,
      registered: s.accountCreated || Boolean(s.user),
      mobileMasked: `******${decryptField(s.mobileEnc).slice(-4)}`,
    })),
    total,
    page,
    limit,
  };
}

export async function createStudentAccount(
  data: {
    regNo: string;
    name: string;
    email: string;
    mobile?: string | null;
    departmentId: string;
    year?: number;
    section?: string | null;
    password: string;
    confirmPassword?: string;
    /** ACTIVE | INACTIVE — INACTIVE maps to SUSPENDED (cannot log in) */
    status?: 'ACTIVE' | 'INACTIVE';
  },
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const regNo = normalizeRegNo(data.regNo);
  const email = normalizeEmail(data.email);
  const name = normalizeName(data.name);
  const section = data.section?.trim() ? data.section.trim().toUpperCase() : null;
  const year = data.year ?? 1;
  const active = (data.status ?? 'ACTIVE') !== 'INACTIVE';

  if (!isValidRegNo(regNo)) {
    throw new AppError(400, 'Invalid register number (6–12 letters/numbers)', 'INVALID_REG_NO');
  }
  if (!name) throw new AppError(400, 'Full name is required');
  if (!isValidEmail(email)) {
    throw new AppError(400, 'Invalid college email', 'INVALID_EMAIL');
  }
  if (env.collegeEmailDomain && !isValidEmail(email, env.collegeEmailDomain)) {
    // Soft warning only if domain is set — allow other college domains if needed
  }

  assertStrongPassword(data.password);
  assertPasswordsMatch(data.password, data.confirmPassword);

  const department = await prisma.department.findUnique({ where: { id: data.departmentId } });
  if (!department) throw new AppError(400, 'Invalid department');

  // Mobile optional — still need unique mobileHash for schema constraint
  const rawMobile = data.mobile?.trim() ? normalizeMobile(data.mobile) : '';
  const hasMobile = rawMobile.length === 10;
  const mobile = hasMobile ? rawMobile : '';
  const mobileHash = hasMobile
    ? hashValue(mobile)
    : hashValue(`__nomobile__:${regNo}`);
  const mobileEnc = encryptField(hasMobile ? mobile : `NONE:${regNo}`);

  const exists = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { regNo },
        { email },
        ...(hasMobile ? [{ mobileHash }] : []),
      ],
    },
  });
  if (exists) {
    if (exists.regNo === regNo) {
      throw new AppError(
        409,
        'A student account with this register number already exists and can log in',
        'DUPLICATE_REG_NO',
      );
    }
    if (exists.email === email) {
      throw new AppError(409, 'A student with this email already exists', 'DUPLICATE_EMAIL');
    }
    throw new AppError(409, 'A student with this mobile number already exists', 'DUPLICATE_MOBILE');
  }

  // Hash unique password for THIS student only (bcrypt, never plain text)
  const passwordHash = await hashPassword(data.password);

  const user = await prisma.$transaction(async (tx) => {
    const releaseSoftDeleted = async (userId: string) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          studentMasterId: null,
          email: `deleted+${userId.slice(0, 8)}@invalid.local`,
          mobileHash: `deleted_${userId}`,
          regNo: `DEL${userId.replace(/-/g, '').slice(0, 9)}`.slice(0, 12),
        },
      });
    };

    const softConflicts = await tx.user.findMany({
      where: {
        deletedAt: { not: null },
        OR: [{ regNo }, { email }, { mobileHash }],
      },
    });
    for (const soft of softConflicts) {
      await releaseSoftDeleted(soft.id);
    }

    let master = await tx.studentMaster.findUnique({
      where: { regNo },
      include: { user: true },
    });

    if (master?.user && !master.user.deletedAt) {
      throw new AppError(409, 'This register number already has a login account', 'DUPLICATE_REG_NO');
    }

    if (master?.user?.deletedAt) {
      await releaseSoftDeleted(master.user.id);
    }

    const masterData = {
      name,
      email,
      mobileHash,
      mobileEnc,
      departmentId: data.departmentId,
      year,
      section,
      status: active ? ('ACTIVE' as const) : ('INACTIVE' as const),
      verified: true,
      accountCreated: true,
    };

    if (master) {
      master = await tx.studentMaster.update({
        where: { id: master.id },
        data: masterData,
        include: { user: true },
      });
    } else {
      master = await tx.studentMaster.create({
        data: {
          regNo,
          ...masterData,
        },
        include: { user: true },
      });
    }

    // Single transaction: User + Profile + link to master — login credentials live on User
    return tx.user.create({
      data: {
        regNo,
        email,
        passwordHash,
        mobileHash,
        mobileEnc,
        role: 'STUDENT',
        departmentId: data.departmentId,
        studentMasterId: master.id,
        accountStatus: active ? 'ACTIVE' : 'SUSPENDED',
        // Admin-set password is temporary — student must set their own on first login
        forcePasswordChange: true,
        failedLoginCount: 0,
        lockedUntil: null,
        profile: {
          create: {
            name,
            year,
            section,
            privacy: 'PUBLIC',
          },
        },
      },
      include: { profile: true, department: true },
    });
  });

  await writeAuditLog({
    userId: adminId,
    action: 'USER_CREATED',
    resourceType: 'user',
    resourceId: user.id,
    metadata: {
      regNo,
      studentName: name,
      role: 'STUDENT',
      accountStatus: user.accountStatus,
      passwordSetByAdmin: true,
    },
    ...meta,
  });

  return {
    id: user.id,
    regNo: user.regNo,
    name: user.profile?.name,
    email: user.email,
    section: user.profile?.section ?? section,
    year: user.profile?.year ?? year,
    department: user.department.name,
    accountStatus: user.accountStatus,
    /** Echo only in API response for admin to copy once — never stored plain */
    passwordSet: true,
    forcePasswordChange: true,
    canLoginImmediately: active,
    loginHint: active
      ? 'Student logs in with Register Number + this password, then must set a new password on first login'
      : 'Account is inactive — activate before the student can log in',
  };
}

export async function updateStudent(
  userId: string,
  data: {
    name?: string;
    email?: string;
    mobile?: string;
    departmentId?: string;
    year?: number | null;
    section?: string | null;
    verifiedBadge?: boolean;
    status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  },
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'STUDENT', deletedAt: null },
  });
  if (!user) throw new AppError(404, 'Student not found');

  const updateData: Record<string, unknown> = {};
  if (data.email) {
    const email = normalizeEmail(data.email);
    const clash = await prisma.user.findFirst({
      where: { email, deletedAt: null, NOT: { id: userId } },
    });
    if (clash) throw new AppError(409, 'Email already in use', 'DUPLICATE_EMAIL');
    updateData.email = email;
  }
  if (data.departmentId) updateData.departmentId = data.departmentId;
  if (data.verifiedBadge !== undefined) updateData.verifiedBadge = data.verifiedBadge;
  if (data.status === 'ACTIVE') {
    updateData.accountStatus = 'ACTIVE';
    updateData.suspendedAt = null;
  } else if (data.status === 'INACTIVE' || data.status === 'SUSPENDED') {
    updateData.accountStatus = 'SUSPENDED';
    updateData.suspendedAt = new Date();
  }
  if (data.mobile) {
    const mobile = normalizeMobile(data.mobile);
    const mobileHash = hashValue(mobile);
    const clash = await prisma.user.findFirst({
      where: { mobileHash, deletedAt: null, NOT: { id: userId } },
    });
    if (clash) throw new AppError(409, 'Mobile already in use', 'DUPLICATE_MOBILE');
    updateData.mobileHash = mobileHash;
    updateData.mobileEnc = encryptField(mobile);
  }

  const section =
    data.section !== undefined
      ? data.section?.trim()
        ? data.section.trim().toUpperCase()
        : null
      : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: updateData });
    if (
      data.name !== undefined ||
      data.year !== undefined ||
      section !== undefined
    ) {
      await tx.profile.update({
        where: { userId },
        data: {
          ...(data.name ? { name: normalizeName(data.name) } : {}),
          ...(data.year !== undefined ? { year: data.year } : {}),
          ...(section !== undefined ? { section } : {}),
        },
      });
    }
    if (user.studentMasterId && (data.email || data.name || data.year !== undefined || section !== undefined || data.departmentId || data.status)) {
      await tx.studentMaster.update({
        where: { id: user.studentMasterId },
        data: {
          ...(data.email ? { email: normalizeEmail(data.email) } : {}),
          ...(data.name ? { name: normalizeName(data.name) } : {}),
          ...(data.year !== undefined && data.year !== null ? { year: data.year } : {}),
          ...(section !== undefined ? { section } : {}),
          ...(data.departmentId ? { departmentId: data.departmentId } : {}),
          ...(data.status === 'ACTIVE'
            ? { status: 'ACTIVE' as const }
            : data.status === 'INACTIVE' || data.status === 'SUSPENDED'
              ? { status: 'INACTIVE' as const }
              : {}),
        },
      });
    }
  });

  await writeAuditLog({
    userId: adminId,
    action: 'USER_UPDATED',
    resourceType: 'user',
    resourceId: userId,
    metadata: { regNo: user.regNo, fields: Object.keys(data) },
    ...meta,
  });

  return { message: 'Student updated' };
}

export async function suspendStudent(
  userId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
  reason?: string,
) {
  const user = await prisma.user.update({
    where: { id: userId, role: 'STUDENT' },
    data: { accountStatus: 'SUSPENDED', suspendedAt: new Date() },
    include: { profile: true },
  });
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAuditLog({
    userId: adminId,
    action: 'USER_SUSPENDED',
    resourceType: 'user',
    resourceId: userId,
    metadata: {
      regNo: user.regNo,
      studentName: user.profile?.name ?? user.regNo,
      reason: reason ?? 'Not specified',
    },
    ...meta,
  });
  return { message: 'Student suspended' };
}

export async function activateStudent(
  userId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const user = await prisma.user.update({
    where: { id: userId, role: 'STUDENT' },
    data: {
      accountStatus: 'ACTIVE',
      suspendedAt: null,
      lockedUntil: null,
      failedLoginCount: 0,
    },
  });
  await prisma.$executeRawUnsafe(
    `UPDATE users SET last_failed_login_at = NULL WHERE id = $1`,
    userId,
  ).catch(() => undefined);
  await writeAuditLog({
    userId: adminId,
    action: 'USER_ACTIVATED',
    resourceType: 'user',
    resourceId: userId,
    metadata: { regNo: user.regNo },
    ...meta,
  });
  return { message: 'Student activated' };
}

/** Clear login lockout immediately (does not change SUSPENDED status). */
export async function unlockStudentAccount(
  userId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
  reason?: string,
) {
  const existing = await prisma.user.findFirst({
    where: { id: userId, role: 'STUDENT' },
    include: { profile: true },
  });
  if (!existing) throw new AppError(404, 'Student not found');

  await prisma.user.update({
    where: { id: userId },
    data: {
      lockedUntil: null,
      failedLoginCount: 0,
    },
  });
  await prisma.$executeRawUnsafe(
    `UPDATE users SET last_failed_login_at = NULL WHERE id = $1`,
    userId,
  ).catch(() => undefined);

  await writeAuditLog({
    userId: adminId,
    action: 'USER_ACTIVATED',
    resourceType: 'user',
    resourceId: userId,
    metadata: {
      action: 'unlock_account',
      regNo: existing.regNo,
      studentName: existing.profile?.name ?? existing.regNo,
      reason: reason ?? 'Admin unlock',
      previousFailedAttempts: existing.failedLoginCount,
      previousLockedUntil: existing.lockedUntil?.toISOString() ?? null,
    },
    ...meta,
  });

  return {
    message: 'Account unlocked. Student can log in immediately.',
    regNo: existing.regNo,
    failedLoginCount: 0,
    lockedUntil: null,
  };
}

/** Manually lock a student account until a given time (default 24h). */
export async function lockStudentAccount(
  userId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
  options?: { reason?: string; durationMinutes?: number },
) {
  const existing = await prisma.user.findFirst({
    where: { id: userId, role: 'STUDENT', deletedAt: null },
    include: { profile: true },
  });
  if (!existing) throw new AppError(404, 'Student not found');

  const minutes = Math.max(1, options?.durationMinutes ?? 24 * 60);
  const lockedUntil = new Date(Date.now() + minutes * 60 * 1000);

  await prisma.user.update({
    where: { id: userId },
    data: { lockedUntil },
  });
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await writeAuditLog({
    userId: adminId,
    action: 'USER_SUSPENDED',
    resourceType: 'user',
    resourceId: userId,
    metadata: {
      action: 'lock_account',
      regNo: existing.regNo,
      studentName: existing.profile?.name ?? existing.regNo,
      reason: options?.reason ?? 'Admin lock',
      lockedUntil: lockedUntil.toISOString(),
      durationMinutes: minutes,
    },
    ...meta,
  });

  return {
    message: `Account locked until ${lockedUntil.toISOString()}. All sessions revoked.`,
    regNo: existing.regNo,
    lockedUntil,
    isLocked: true,
  };
}

export async function resetStudentPassword(
  userId: string,
  newPassword: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
  confirmPassword?: string,
  resetReason?: string,
) {
  assertStrongPassword(newPassword);
  assertPasswordsMatch(newPassword, confirmPassword);

  const existing = await prisma.user.findFirst({
    where: { id: userId, role: 'STUDENT', deletedAt: null },
  });
  if (!existing) throw new AppError(404, 'Student not found');

  const passwordHash = await hashPassword(newPassword);
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      failedLoginCount: 0,
      lockedUntil: null,
      lastFailedLoginAt: null,
      // Temporary password — student must set a private password on next login
      forcePasswordChange: true,
      accountStatus:
        existing.accountStatus === 'UNVERIFIED' ? 'ACTIVE' : existing.accountStatus,
    },
  });
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await prisma.passwordResetLog.create({
    data: {
      studentId: userId,
      adminId,
      resetReason: resetReason?.trim() || 'Admin temporary password reset',
    },
  });
  const profile = await prisma.profile.findUnique({ where: { userId } });
  await writeAuditLog({
    userId: adminId,
    action: 'PASSWORD_RESET',
    resourceType: 'user',
    resourceId: userId,
    metadata: {
      regNo: user.regNo,
      studentName: profile?.name ?? user.regNo,
      by: 'super_admin',
      forceChange: true,
      isFirstLogin: true,
      reason: resetReason ?? 'Admin password reset',
    },
    ...meta,
  });
  return {
    message:
      'Temporary password set. Student must change it on next login. Share the temp password out of band — it is not stored in plain text.',
    regNo: user.regNo,
    passwordUpdated: true,
    forcePasswordChange: true,
    isFirstLogin: true,
  };
}

/** Mark student to change password on next login without setting a new temp password. */
export async function forceStudentPasswordChange(
  userId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
  reason?: string,
) {
  const existing = await prisma.user.findFirst({
    where: { id: userId, role: 'STUDENT', deletedAt: null },
  });
  if (!existing) throw new AppError(404, 'Student not found');

  await prisma.user.update({
    where: { id: userId },
    data: { forcePasswordChange: true },
  });
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAuditLog({
    userId: adminId,
    action: 'PASSWORD_CHANGE',
    resourceType: 'user',
    resourceId: userId,
    metadata: {
      regNo: existing.regNo,
      action: 'force_password_change_flag',
      reason: reason ?? 'Admin required password change',
    },
    ...meta,
  });
  return {
    message: 'Student will be required to change password on next login. All sessions were revoked.',
    forcePasswordChange: true,
    isFirstLogin: true,
  };
}

export async function revokeAllUserSessions(
  userId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAuditLog({
    userId: adminId,
    action: 'SESSION_REVOKED',
    resourceType: 'user',
    resourceId: userId,
    metadata: { count: result.count },
    ...meta,
  });
  return { message: `Logged out of ${result.count} device(s)` };
}

export async function softDeleteStudent(
  userId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
  reason?: string,
) {
  const user = await prisma.user.update({
    where: { id: userId, role: 'STUDENT' },
    data: { deletedAt: new Date(), online: false, accountStatus: 'SUSPENDED' },
    include: { profile: true },
  });
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAuditLog({
    userId: adminId,
    action: 'USER_DELETED',
    resourceType: 'user',
    resourceId: userId,
    metadata: {
      regNo: user.regNo,
      soft: true,
      reason: reason ?? 'Not specified',
      studentName: user.profile?.name ?? user.regNo,
    },
    ...meta,
  });
  return { message: 'Student account soft-deleted' };
}

export async function warnStudent(
  userId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
  reason: string,
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'STUDENT' },
    include: { profile: true },
  });
  if (!user) throw new AppError(404, 'Student not found');

  await writeAuditLog({
    userId: adminId,
    action: 'USER_WARNED',
    resourceType: 'user',
    resourceId: userId,
    metadata: {
      regNo: user.regNo,
      studentName: user.profile?.name ?? user.regNo,
      reason: reason.trim() || 'Warning issued',
    },
    ...meta,
  });

  return { message: 'Warning recorded in audit log' };
}

export async function banStudent(
  userId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
  reason: string,
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'STUDENT' },
    include: { profile: true },
  });
  if (!user) throw new AppError(404, 'Student not found');

  await prisma.user.update({
    where: { id: userId },
    data: {
      accountStatus: 'SUSPENDED',
      suspendedAt: new Date(),
      deletedAt: new Date(),
      online: false,
    },
  });
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await writeAuditLog({
    userId: adminId,
    action: 'USER_DELETED',
    resourceType: 'user',
    resourceId: userId,
    metadata: {
      regNo: user.regNo,
      studentName: user.profile?.name ?? user.regNo,
      reason: reason.trim() || 'Banned',
      ban: true,
      soft: true,
    },
    ...meta,
  });
  return { message: 'Student banned (account deactivated)' };
}

function mediaKind(url: string | null | undefined): 'photo' | 'video' | 'unknown' {
  if (!url) return 'unknown';
  const lower = url.toLowerCase();
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(lower) || lower.includes('/video')) return 'video';
  if (/\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(lower) || lower.includes('/image')) return 'photo';
  return 'photo';
}

export async function getStudentAdminProfile(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'STUDENT' },
    include: {
      profile: true,
      department: true,
      studentMaster: true,
    },
  });
  if (!user) throw new AppError(404, 'Student not found');

  const now = new Date();
  const [
    posts,
    stories,
    friendsCount,
    reportsAgainst,
    sessions,
    loginHistory,
    auditOnStudent,
    likesReceived,
    passwordResetLogs,
  ] = await Promise.all([
    prisma.post.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { _count: { select: { likes: true } } },
    }),
    prisma.story.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.friendRequest.count({
      where: {
        status: 'ACCEPTED',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
    }),
    prisma.contentReport.findMany({
      where: {
        OR: [{ targetUserId: userId }, { targetId: userId, targetType: 'USER' }],
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        reporter: { include: { profile: true } },
      },
    }),
    prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.loginHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.auditLog.findMany({
      where: {
        resourceType: 'user',
        resourceId: userId,
        action: {
          in: [
            'USER_SUSPENDED',
            'USER_ACTIVATED',
            'USER_WARNED',
            'PASSWORD_RESET',
            'PASSWORD_CHANGE',
            'USER_DELETED',
            'USER_UPDATED',
            'USER_CREATED',
            'SESSION_REVOKED',
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { user: { include: { profile: true } } },
    }),
    prisma.postLike.count({
      where: { post: { authorId: userId, deletedAt: null } },
    }),
    prisma.passwordResetLog.findMany({
      where: { studentId: userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { admin: { include: { profile: true } } },
    }),
  ]);

  const postIds = posts.map((p) => p.id);
  const storyIds = stories.map((s) => s.id);
  const reportCounts =
    postIds.length || storyIds.length
      ? await prisma.contentReport.groupBy({
          by: ['targetId'],
          where: {
            OR: [
              ...(postIds.length
                ? [{ targetType: 'POST' as const, targetId: { in: postIds } }]
                : []),
              ...(storyIds.length
                ? [{ targetType: 'STORY' as const, targetId: { in: storyIds } }]
                : []),
            ],
          },
          _count: { _all: true },
        })
      : [];
  const reportCountMap = new Map(reportCounts.map((r) => [r.targetId, r._count._all]));

  let mobile: string | null = null;
  try {
    mobile = user.mobileEnc ? decryptField(user.mobileEnc) : null;
  } catch {
    mobile = null;
  }

  const activePosts = posts.filter((p) => !p.deletedAt);
  const photos = activePosts.filter((p) => mediaKind(p.mediaUrl) === 'photo' && p.mediaUrl).length;
  const videos = activePosts.filter((p) => mediaKind(p.mediaUrl) === 'video').length;

  const name = user.profile?.name ?? user.regNo;

  return {
    profile: {
      id: user.id,
      regNo: user.regNo,
      fullName: name,
      name,
      collegeEmail: user.email,
      email: user.email,
      mobile,
      department: user.department.name,
      departmentId: user.departmentId,
      year: user.profile?.year ?? user.studentMaster?.year ?? null,
      profilePhotoUrl: user.profile?.profilePhotoUrl ?? null,
      coverPhotoUrl: null as string | null,
      accountStatus: user.accountStatus,
      verificationStatus: user.verifiedBadge
        ? 'VERIFIED'
        : user.studentMaster?.verified
          ? 'MASTER_VERIFIED'
          : 'UNVERIFIED',
      verifiedBadge: user.verifiedBadge,
      joinDate: user.createdAt,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      lastSeen: user.lastSeen,
      online: user.online,
      suspendedAt: user.suspendedAt,
      deletedAt: user.deletedAt,
      forcePasswordChange: user.forcePasswordChange,
      failedLoginCount: user.failedLoginCount,
      lockedUntil: user.lockedUntil,
      lastFailedLoginAt: (user as { lastFailedLoginAt?: Date | null }).lastFailedLoginAt ?? null,
      isLocked: Boolean(user.lockedUntil && user.lockedUntil > new Date()),
      bio: user.profile?.bio ?? null,
    },
    stats: {
      totalPosts: activePosts.length,
      totalPhotos: photos,
      totalVideos: videos,
      totalStories: stories.length,
      friends: friendsCount,
      followers: friendsCount,
      following: friendsCount,
      communitiesJoined: 0,
      eventsJoined: 0,
      totalLikesReceived: likesReceived,
      totalCommentsReceived: 0,
    },
    posts: posts.map((p) => ({
      id: p.id,
      caption: p.caption,
      mediaUrl: p.mediaUrl,
      mediaKind: mediaKind(p.mediaUrl),
      visibility: p.visibility,
      createdAt: p.createdAt,
      deletedAt: p.deletedAt,
      likes: p._count.likes,
      comments: 0,
      shares: 0,
      reportCount: reportCountMap.get(p.id) ?? 0,
      author: {
        id: user.id,
        name,
        profilePhotoUrl: user.profile?.profilePhotoUrl ?? null,
      },
    })),
    stories: stories.map((s) => ({
      id: s.id,
      mediaUrl: s.mediaUrl,
      caption: s.caption,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
      reportCount: reportCountMap.get(s.id) ?? 0,
    })),
    comments: [] as Array<{
      id: string;
      body: string;
      createdAt: string;
      postId: string | null;
    }>,
    reports: reportsAgainst.map((r) => ({
      id: r.id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      targetType: r.targetType,
      targetId: r.targetId,
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt,
      adminNotes: r.adminNotes,
      reporter: {
        id: r.reporterId,
        name: r.reporter.profile?.name ?? r.reporter.regNo,
        regNo: r.reporter.regNo,
      },
    })),
    activity: {
      lastLoginAt: user.lastLoginAt,
      accountCreationDate: user.createdAt,
      loginDevices: sessions.map((s) => ({
        id: s.id,
        deviceLabel: s.deviceLabel,
        userAgent: s.userAgent,
        ipAddress: s.ipAddress,
        createdAt: s.createdAt,
        expiresAt: s.expiresAt,
        revokedAt: s.revokedAt,
        active: !s.revokedAt && s.expiresAt > now,
      })),
      recentLogins: loginHistory.map((h) => ({
        id: h.id,
        success: h.success,
        method: h.method,
        ipAddress: h.ipAddress,
        userAgent: h.userAgent,
        reason: h.reason,
        createdAt: h.createdAt,
      })),
      recentUploads: [
        ...posts.slice(0, 10).map((p) => ({
          type: 'post' as const,
          id: p.id,
          mediaUrl: p.mediaUrl,
          caption: p.caption,
          createdAt: p.createdAt,
          deleted: Boolean(p.deletedAt),
        })),
        ...stories.slice(0, 10).map((s) => ({
          type: 'story' as const,
          id: s.id,
          mediaUrl: s.mediaUrl,
          caption: s.caption,
          createdAt: s.createdAt,
          deleted: false,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      passwordResetHistory:
        passwordResetLogs.length > 0
          ? passwordResetLogs.map((h) => ({
              id: h.id,
              adminName: h.admin.profile?.name ?? h.admin.regNo,
              timestamp: h.createdAt,
              reason: h.resetReason,
            }))
          : auditOnStudent
              .filter((a) => a.action === 'PASSWORD_RESET')
              .map((a) => ({
                id: a.id,
                adminName: a.user?.profile?.name ?? a.user?.regNo ?? 'System',
                timestamp: a.createdAt,
                reason: (a.metadata as { reason?: string } | null)?.reason ?? null,
              })),
      suspensions: auditOnStudent
        .filter((a) => a.action === 'USER_SUSPENDED' || a.action === 'USER_ACTIVATED')
        .map((a) => ({
          id: a.id,
          action: a.action,
          adminName: a.user?.profile?.name ?? a.user?.regNo ?? 'System',
          timestamp: a.createdAt,
          reason: (a.metadata as { reason?: string } | null)?.reason ?? null,
        })),
      warningHistory: auditOnStudent
        .filter((a) => a.action === 'USER_WARNED')
        .map((a) => ({
          id: a.id,
          adminName: a.user?.profile?.name ?? a.user?.regNo ?? 'System',
          timestamp: a.createdAt,
          reason: (a.metadata as { reason?: string } | null)?.reason ?? 'Warning',
        })),
      moderationHistory: auditOnStudent.map((a) => ({
        id: a.id,
        action: a.action,
        adminName: a.user?.profile?.name ?? a.user?.regNo ?? 'System',
        timestamp: a.createdAt,
        reason: (a.metadata as { reason?: string } | null)?.reason ?? null,
        metadata: a.metadata,
      })),
    },
    privacyNote:
      'Super Admin cannot view student passwords, private chats, private calls, or deleted encrypted messages unless formally reported under college policy.',
  };
}

export async function addMasterStudent(
  data: {
    name: string;
    reg_no: string;
    mobile: string;
    email: string;
    department: string;
    year: number;
  },
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const regNo = normalizeRegNo(data.reg_no);
  const existing = await prisma.studentMaster.findUnique({ where: { regNo } });
  if (existing) throw new AppError(409, 'Register number already in master roster');

  const department = await prisma.department.upsert({
    where: { name: data.department.trim() },
    update: {},
    create: { name: data.department.trim() },
  });

  const mobile = normalizeMobile(data.mobile);
  const record = await prisma.studentMaster.create({
    data: {
      regNo,
      name: normalizeName(data.name),
      mobileHash: hashValue(mobile),
      mobileEnc: encryptField(mobile),
      email: normalizeEmail(data.email),
      departmentId: department.id,
      year: data.year,
    },
  });

  await writeAuditLog({
    userId: adminId,
    action: 'STUDENT_MASTER_IMPORT',
    resourceType: 'student_master',
    resourceId: record.id,
    metadata: { regNo, action: 'add_single' },
    ...meta,
  });

  return record;
}