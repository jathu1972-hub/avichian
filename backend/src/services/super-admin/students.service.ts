import { normalizeEmail, normalizeMobile, normalizeName, normalizeRegNo } from '@avichian/shared';
import { prisma } from '../../lib/prisma.js';
import { decryptField, encryptField, hashValue } from '../../utils/crypto.js';
import { hashPassword } from '../../utils/password.js';
import { AppError } from '../../utils/errors.js';
import { writeAuditLog } from '../audit.service.js';

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
    mobile: string;
    departmentId: string;
    year?: number;
    password: string;
  },
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const regNo = normalizeRegNo(data.regNo);
  const email = normalizeEmail(data.email);
  const mobile = normalizeMobile(data.mobile);
  const name = normalizeName(data.name);
  if (data.password.length < 8) throw new AppError(400, 'Password too short');

  const department = await prisma.department.findUnique({ where: { id: data.departmentId } });
  if (!department) throw new AppError(400, 'Invalid department');

  const mobileHash = hashValue(mobile);
  const exists = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      OR: [{ regNo }, { email }, { mobileHash }],
    },
  });
  if (exists) {
    throw new AppError(
      409,
      exists.regNo === regNo
        ? 'A student account with this register number already exists and can log in'
        : 'Student with this email or mobile already exists',
    );
  }

  const passwordHash = await hashPassword(data.password);
  const year = data.year ?? null;

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

    // Free unique columns held by soft-deleted rows (regNo / email / mobile)
    const softConflicts = await tx.user.findMany({
      where: {
        deletedAt: { not: null },
        OR: [{ regNo }, { email }, { mobileHash }],
      },
    });
    for (const soft of softConflicts) {
      await releaseSoftDeleted(soft.id);
    }

    // Keep Student Master in sync so roster + app login share one source of truth
    let master = await tx.studentMaster.findUnique({
      where: { regNo },
      include: { user: true },
    });

    if (master?.user && !master.user.deletedAt) {
      throw new AppError(409, 'This register number already has a login account');
    }

    if (master?.user?.deletedAt) {
      await releaseSoftDeleted(master.user.id);
    }

    if (master) {
      master = await tx.studentMaster.update({
        where: { id: master.id },
        data: {
          name,
          email,
          mobileHash,
          mobileEnc: encryptField(mobile),
          departmentId: data.departmentId,
          year: year ?? master.year,
          status: 'ACTIVE',
          verified: true,
          accountCreated: true,
        },
        include: { user: true },
      });
    } else {
      master = await tx.studentMaster.create({
        data: {
          regNo,
          name,
          email,
          mobileHash,
          mobileEnc: encryptField(mobile),
          departmentId: data.departmentId,
          year: year ?? 1,
          status: 'ACTIVE',
          verified: true,
          accountCreated: true,
        },
        include: { user: true },
      });
    }

    return tx.user.create({
      data: {
        regNo,
        email,
        passwordHash,
        mobileHash,
        mobileEnc: encryptField(mobile),
        role: 'STUDENT',
        departmentId: data.departmentId,
        studentMasterId: master.id,
        accountStatus: 'ACTIVE',
        forcePasswordChange: true,
        profile: {
          create: {
            name,
            year,
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
      temporaryPassword: true,
      accountStatus: 'ACTIVE',
    },
    ...meta,
  });

  return {
    id: user.id,
    regNo: user.regNo,
    name: user.profile?.name,
    email: user.email,
    accountStatus: user.accountStatus,
    temporaryPassword: data.password,
    forcePasswordChange: true,
    canLoginImmediately: true,
    loginHint: 'Student can log in now with Register Number + temporary password',
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
    verifiedBadge?: boolean;
  },
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'STUDENT', deletedAt: null },
  });
  if (!user) throw new AppError(404, 'Student not found');

  const updateData: Record<string, unknown> = {};
  if (data.email) updateData.email = normalizeEmail(data.email);
  if (data.departmentId) updateData.departmentId = data.departmentId;
  if (data.verifiedBadge !== undefined) updateData.verifiedBadge = data.verifiedBadge;
  if (data.mobile) {
    const mobile = normalizeMobile(data.mobile);
    updateData.mobileHash = hashValue(mobile);
    updateData.mobileEnc = encryptField(mobile);
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: updateData }),
    ...(data.name !== undefined || data.year !== undefined
      ? [
          prisma.profile.update({
            where: { userId },
            data: {
              ...(data.name ? { name: normalizeName(data.name) } : {}),
              ...(data.year !== undefined ? { year: data.year } : {}),
            },
          }),
        ]
      : []),
  ]);

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

export async function resetStudentPassword(
  userId: string,
  newPassword: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  if (newPassword.length < 8) throw new AppError(400, 'Password too short');
  const passwordHash = await hashPassword(newPassword);
  const user = await prisma.user.update({
    where: { id: userId, role: 'STUDENT' },
    data: {
      passwordHash,
      failedLoginCount: 0,
      lockedUntil: null,
      forcePasswordChange: true,
    },
  });
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
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
      reason: 'Admin password reset',
    },
    ...meta,
  });
  return {
    message: 'Password reset. Student must change password on next login.',
    temporaryPassword: newPassword,
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
      passwordResetHistory: auditOnStudent
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