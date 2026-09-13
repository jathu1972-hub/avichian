import {
  isValidEmail,
  isValidMobile,
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
import { revokeAllSessions } from '../session.service.js';

/** Fine-grained Super Admin portal permissions */
export type SuperAdminPermissionKey =
  | 'studentManagement'
  | 'communityManagement'
  | 'events'
  | 'moderation'
  | 'reports'
  | 'settings'
  | 'superAdminManagement'
  | 'announcements'
  | 'passwordReset';

export type SuperAdminPermissions = Record<SuperAdminPermissionKey, boolean>;

export const ALL_SUPER_ADMIN_PERMISSIONS: SuperAdminPermissions = {
  studentManagement: true,
  communityManagement: true,
  events: true,
  moderation: true,
  reports: true,
  settings: true,
  superAdminManagement: true,
  announcements: true,
  passwordReset: true,
};

export const PERMISSION_LABELS: Record<SuperAdminPermissionKey, string> = {
  studentManagement: 'Student Management',
  communityManagement: 'Community Management',
  events: 'Events',
  moderation: 'Moderation',
  reports: 'Reports',
  settings: 'Settings',
  superAdminManagement: 'Super Admin Management',
  announcements: 'Announcements',
  passwordReset: 'Password Reset',
};

function normalizePermissions(input?: Partial<SuperAdminPermissions> | null): SuperAdminPermissions {
  const base = { ...ALL_SUPER_ADMIN_PERMISSIONS };
  if (!input || typeof input !== 'object') return base;
  for (const key of Object.keys(base) as SuperAdminPermissionKey[]) {
    if (typeof input[key] === 'boolean') base[key] = input[key]!;
  }
  return base;
}

function parsePermissions(raw: unknown): SuperAdminPermissions {
  if (!raw || typeof raw !== 'object') return { ...ALL_SUPER_ADMIN_PERMISSIONS };
  return normalizePermissions(raw as Partial<SuperAdminPermissions>);
}

function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
}

function isValidUsername(username: string): boolean {
  return /^[a-z][a-z0-9._-]{2,31}$/.test(username);
}

function maskMobile(enc: string): string {
  try {
    const m = decryptField(enc);
    if (!m || m.startsWith('NONE:')) return '—';
    return `******${m.slice(-4)}`;
  } catch {
    return '—';
  }
}

function mobilePlain(enc: string): string | null {
  try {
    const m = decryptField(enc);
    if (!m || m.startsWith('NONE:')) return null;
    return m;
  } catch {
    return null;
  }
}

async function countActiveSuperAdmins(excludeUserId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      role: 'SUPER_ADMIN',
      deletedAt: null,
      accountStatus: 'ACTIVE',
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
    },
  });
}

async function loadAdminOrThrow(userId: string) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'SUPER_ADMIN', deletedAt: null },
    include: {
      profile: true,
      admin: { include: { createdBy: { include: { profile: true } } } },
      department: true,
    },
  });
  if (!user || !user.admin) {
    throw new AppError(404, 'Super Admin not found', 'SUPER_ADMIN_NOT_FOUND');
  }
  return user;
}

function mapSuperAdmin(user: Awaited<ReturnType<typeof loadAdminOrThrow>>) {
  const admin = user.admin!;
  const perms = parsePermissions(admin.permissions);
  return {
    id: user.id,
    adminRecordId: admin.id,
    name: user.profile?.name ?? user.regNo,
    employeeId: admin.employeeId ?? user.regNo,
    mobile: mobilePlain(user.mobileEnc),
    mobileHint: maskMobile(user.mobileEnc),
    email: user.email,
    username: admin.username,
    profilePhotoUrl: user.profile?.profilePhotoUrl ?? null,
    status: user.accountStatus,
    role: admin.isRoot ? 'ROOT_SUPER_ADMIN' : 'SUPER_ADMIN',
    isRoot: admin.isRoot,
    permissions: perms,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdBy: admin.createdBy
      ? {
          id: admin.createdBy.id,
          name: admin.createdBy.profile?.name ?? admin.createdBy.regNo,
          username: undefined as string | undefined,
        }
      : null,
    createdById: admin.createdById,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    forcePasswordChange: user.forcePasswordChange,
    department: user.department?.name ?? 'Administration',
  };
}

export async function listSuperAdmins(params?: { search?: string }) {
  const search = params?.search?.trim();
  const items = await prisma.user.findMany({
    where: {
      role: 'SUPER_ADMIN',
      deletedAt: null,
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' } },
              { regNo: { contains: search, mode: 'insensitive' } },
              { profile: { name: { contains: search, mode: 'insensitive' } } },
              { admin: { username: { contains: search, mode: 'insensitive' } } },
              { admin: { employeeId: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    },
    orderBy: [{ admin: { isRoot: 'desc' } }, { createdAt: 'asc' }],
    include: {
      profile: true,
      department: true,
      admin: { include: { createdBy: { include: { profile: true } } } },
    },
  });

  // Attach creator usernames
  const creatorIds = items
    .map((u) => u.admin?.createdById)
    .filter((id): id is string => Boolean(id));
  const creators = creatorIds.length
    ? await prisma.admin.findMany({
        where: { userId: { in: creatorIds } },
        select: { userId: true, username: true },
      })
    : [];
  const creatorMap = new Map(creators.map((c) => [c.userId, c.username]));

  return items
    .filter((u) => u.admin)
    .map((u) => {
      const mapped = mapSuperAdmin(u as Awaited<ReturnType<typeof loadAdminOrThrow>>);
      if (mapped.createdBy && mapped.createdById) {
        mapped.createdBy.username = creatorMap.get(mapped.createdById);
      }
      return mapped;
    });
}

export async function getSuperAdmin(userId: string) {
  const user = await loadAdminOrThrow(userId);
  const mapped = mapSuperAdmin(user);
  if (mapped.createdById) {
    const creatorAdmin = await prisma.admin.findUnique({
      where: { userId: mapped.createdById },
      select: { username: true },
    });
    if (mapped.createdBy) mapped.createdBy.username = creatorAdmin?.username;
  }
  return mapped;
}

export async function getSuperAdminActivity(userId: string, limit = 50) {
  await loadAdminOrThrow(userId);
  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [{ userId }, { resourceId: userId, resourceType: 'super_admin' }],
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
  });
  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    resourceType: l.resourceType,
    resourceId: l.resourceId,
    metadata: l.metadata,
    ipAddress: l.ipAddress,
    createdAt: l.createdAt.toISOString(),
  }));
}

/**
 * Create another Super Admin (only callable by an existing SUPER_ADMIN).
 */
export async function createSuperAdminAccount(
  data: {
    name: string;
    email: string;
    mobile?: string | null;
    username: string;
    employeeId?: string | null;
    password: string;
    confirmPassword?: string;
    profilePhotoUrl?: string | null;
    department?: string | null;
    permissions?: Partial<SuperAdminPermissions> | null;
    status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  },
  creatorId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const email = normalizeEmail(data.email);
  const name = normalizeName(data.name);
  const username = normalizeUsername(data.username);
  const employeeId = data.employeeId?.trim()
    ? normalizeRegNo(data.employeeId)
    : username.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);

  if (!name) throw new AppError(400, 'Full name is required');
  if (!isValidEmail(email)) throw new AppError(400, 'Invalid email', 'INVALID_EMAIL');
  if (!isValidUsername(username)) {
    throw new AppError(
      400,
      'Username must be 3–32 chars, start with a letter, and use only a-z, 0-9, . _ -',
      'INVALID_USERNAME',
    );
  }
  if (employeeId && !isValidRegNo(employeeId) && employeeId.length < 3) {
    throw new AppError(400, 'Invalid employee ID', 'INVALID_EMPLOYEE_ID');
  }

  assertStrongPassword(data.password);
  assertPasswordsMatch(data.password, data.confirmPassword);

  const rawMobile = data.mobile?.trim() ? normalizeMobile(data.mobile) : '';
  if (data.mobile?.trim() && !isValidMobile(rawMobile)) {
    throw new AppError(400, 'Invalid mobile number', 'INVALID_MOBILE');
  }
  const hasMobile = rawMobile.length === 10;
  const mobileHash = hasMobile
    ? hashValue(rawMobile)
    : hashValue(`__nomobile__:admin:${username}`);
  const mobileEnc = encryptField(hasMobile ? rawMobile : `NONE:${username}`);

  const permissions = normalizePermissions(data.permissions);
  const active = (data.status ?? 'ACTIVE') === 'ACTIVE';

  const usernameTaken = await prisma.admin.findUnique({ where: { username } });
  if (usernameTaken) {
    throw new AppError(409, 'Username already in use', 'DUPLICATE_USERNAME');
  }

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
  const deptName = data.department?.trim() || 'Administration';

  const department = await prisma.department.upsert({
    where: { name: deptName },
    update: {},
    create: {
      name: deptName,
      code: deptName.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() || 'ADMIN',
    },
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
        accountStatus: active ? 'ACTIVE' : 'SUSPENDED',
        forcePasswordChange: true,
        failedLoginCount: 0,
        lockedUntil: null,
        profile: {
          create: {
            name,
            privacy: 'PRIVATE',
            profilePhotoUrl: data.profilePhotoUrl ?? null,
          },
        },
        admin: {
          create: {
            username,
            employeeId,
            permissions,
            isRoot: false,
            createdById: creatorId,
          },
        },
      },
      include: {
        profile: true,
        admin: { include: { createdBy: { include: { profile: true } } } },
        department: true,
      },
    });
  });

  await writeAuditLog({
    userId: creatorId,
    action: 'USER_CREATED',
    resourceType: 'super_admin',
    resourceId: user.id,
    metadata: {
      action: 'CREATED_SUPER_ADMIN',
      username,
      employeeId,
      email,
      name,
      permissions,
      // never log password
    },
    ...meta,
  });

  return {
    ...mapSuperAdmin(user as Awaited<ReturnType<typeof loadAdminOrThrow>>),
    passwordSet: true,
    canLoginImmediately: active,
    loginHint: active
      ? 'New Super Admin can log in with Username or Email + temporary password, then must change password'
      : 'Account is inactive — activate before login',
  };
}

export async function updateSuperAdmin(
  targetUserId: string,
  data: {
    name?: string;
    email?: string;
    mobile?: string | null;
    username?: string;
    employeeId?: string | null;
    profilePhotoUrl?: string | null;
    permissions?: Partial<SuperAdminPermissions> | null;
    status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  },
  actorId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const user = await loadAdminOrThrow(targetUserId);

  if (user.admin!.isRoot && data.status && data.status !== 'ACTIVE') {
    throw new AppError(403, 'Root Super Admin cannot be suspended or deactivated', 'ROOT_PROTECTED');
  }

  const updates: {
    email?: string;
    mobileHash?: string;
    mobileEnc?: string;
    accountStatus?: 'ACTIVE' | 'SUSPENDED' | 'UNVERIFIED';
    suspendedAt?: Date | null;
  } = {};
  const profileUpdates: { name?: string; profilePhotoUrl?: string | null } = {};
  const adminUpdates: {
    username?: string;
    employeeId?: string | null;
    permissions?: SuperAdminPermissions;
  } = {};

  if (data.name?.trim()) profileUpdates.name = normalizeName(data.name);
  if (data.profilePhotoUrl !== undefined) profileUpdates.profilePhotoUrl = data.profilePhotoUrl;

  if (data.email) {
    const email = normalizeEmail(data.email);
    if (!isValidEmail(email)) throw new AppError(400, 'Invalid email');
    const clash = await prisma.user.findFirst({
      where: { email, deletedAt: null, id: { not: targetUserId } },
    });
    if (clash) throw new AppError(409, 'Email already in use', 'DUPLICATE_EMAIL');
    updates.email = email;
  }

  if (data.username) {
    const username = normalizeUsername(data.username);
    if (!isValidUsername(username)) {
      throw new AppError(400, 'Invalid username', 'INVALID_USERNAME');
    }
    const clash = await prisma.admin.findFirst({
      where: { username, userId: { not: targetUserId } },
    });
    if (clash) throw new AppError(409, 'Username already in use', 'DUPLICATE_USERNAME');
    adminUpdates.username = username;
  }

  if (data.employeeId !== undefined) {
    adminUpdates.employeeId = data.employeeId?.trim()
      ? normalizeRegNo(data.employeeId)
      : null;
  }

  if (data.mobile !== undefined) {
    if (data.mobile?.trim()) {
      const mobile = normalizeMobile(data.mobile);
      if (!isValidMobile(mobile)) throw new AppError(400, 'Invalid mobile');
      const mobileHash = hashValue(mobile);
      const clash = await prisma.user.findFirst({
        where: { mobileHash, deletedAt: null, id: { not: targetUserId } },
      });
      if (clash) throw new AppError(409, 'Mobile already in use', 'DUPLICATE_MOBILE');
      updates.mobileHash = mobileHash;
      updates.mobileEnc = encryptField(mobile);
    }
  }

  if (data.permissions) {
    adminUpdates.permissions = normalizePermissions({
      ...parsePermissions(user.admin!.permissions),
      ...data.permissions,
    });
  }

  if (data.status) {
    if (data.status === 'ACTIVE') {
      updates.accountStatus = 'ACTIVE';
      updates.suspendedAt = null;
    } else {
      updates.accountStatus = 'SUSPENDED';
      updates.suspendedAt = new Date();
    }
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(updates).length) {
      await tx.user.update({ where: { id: targetUserId }, data: updates });
    }
    if (Object.keys(profileUpdates).length) {
      await tx.profile.update({ where: { userId: targetUserId }, data: profileUpdates });
    }
    if (Object.keys(adminUpdates).length) {
      await tx.admin.update({ where: { userId: targetUserId }, data: adminUpdates });
    }
  });

  await writeAuditLog({
    userId: actorId,
    action: 'USER_UPDATED',
    resourceType: 'super_admin',
    resourceId: targetUserId,
    metadata: {
      action: 'EDITED_SUPER_ADMIN',
      fields: Object.keys({ ...updates, ...profileUpdates, ...adminUpdates }),
    },
    ...meta,
  });

  return getSuperAdmin(targetUserId);
}

export async function suspendSuperAdmin(
  targetUserId: string,
  actorId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  if (targetUserId === actorId) {
    throw new AppError(403, 'You cannot suspend your own account', 'CANNOT_SUSPEND_SELF');
  }
  const user = await loadAdminOrThrow(targetUserId);
  if (user.admin!.isRoot) {
    throw new AppError(403, 'Root Super Admin cannot be suspended', 'ROOT_PROTECTED');
  }
  const remaining = await countActiveSuperAdmins(targetUserId);
  if (remaining < 1) {
    throw new AppError(403, 'Cannot suspend the last active Super Admin', 'LAST_SUPER_ADMIN');
  }

  await prisma.user.update({
    where: { id: targetUserId },
    data: { accountStatus: 'SUSPENDED', suspendedAt: new Date() },
  });
  await revokeAllSessions(targetUserId).catch(() => undefined);

  await writeAuditLog({
    userId: actorId,
    action: 'USER_SUSPENDED',
    resourceType: 'super_admin',
    resourceId: targetUserId,
    metadata: { action: 'SUSPENDED_SUPER_ADMIN', username: user.admin!.username },
    ...meta,
  });

  return getSuperAdmin(targetUserId);
}

export async function activateSuperAdmin(
  targetUserId: string,
  actorId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const user = await loadAdminOrThrow(targetUserId);
  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      accountStatus: 'ACTIVE',
      suspendedAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  await writeAuditLog({
    userId: actorId,
    action: 'USER_ACTIVATED',
    resourceType: 'super_admin',
    resourceId: targetUserId,
    metadata: { action: 'ACTIVATED_SUPER_ADMIN', username: user.admin!.username },
    ...meta,
  });

  return getSuperAdmin(targetUserId);
}

export async function resetSuperAdminPassword(
  targetUserId: string,
  temporaryPassword: string,
  confirmPassword: string | undefined,
  actorId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const user = await loadAdminOrThrow(targetUserId);
  assertStrongPassword(temporaryPassword);
  assertPasswordsMatch(temporaryPassword, confirmPassword);

  const passwordHash = await hashPassword(temporaryPassword);
  await prisma.user.update({
    where: { id: targetUserId },
    data: {
      passwordHash,
      forcePasswordChange: true,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });
  await revokeAllSessions(targetUserId).catch(() => undefined);

  await writeAuditLog({
    userId: actorId,
    action: 'PASSWORD_RESET',
    resourceType: 'super_admin',
    resourceId: targetUserId,
    metadata: {
      action: 'RESET_SUPER_ADMIN_PASSWORD',
      username: user.admin!.username,
      // never log password
    },
    ...meta,
  });

  return {
    id: targetUserId,
    username: user.admin!.username,
    forcePasswordChange: true,
    message: 'Temporary password set. Super Admin must change password on next login.',
  };
}

export async function deleteSuperAdmin(
  targetUserId: string,
  actorId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  if (targetUserId === actorId) {
    throw new AppError(403, 'You cannot delete your own account', 'CANNOT_DELETE_SELF');
  }
  const user = await loadAdminOrThrow(targetUserId);
  if (user.admin!.isRoot) {
    throw new AppError(403, 'Root Super Admin cannot be deleted', 'ROOT_PROTECTED');
  }
  const remaining = await countActiveSuperAdmins(targetUserId);
  if (remaining < 1) {
    throw new AppError(403, 'Cannot delete the last active Super Admin', 'LAST_SUPER_ADMIN');
  }

  await revokeAllSessions(targetUserId).catch(() => undefined);

  // Soft-delete: free unique constraints; keep audit history on user id
  const tombstone = `del_${targetUserId.replace(/-/g, '').slice(0, 10)}`;
  await prisma.$transaction(async (tx) => {
    await tx.admin.delete({ where: { userId: targetUserId } });
    await tx.user.update({
      where: { id: targetUserId },
      data: {
        deletedAt: new Date(),
        accountStatus: 'SUSPENDED',
        email: `${tombstone}@deleted.local`,
        mobileHash: `deleted_${targetUserId}`,
        regNo: tombstone.slice(0, 12).toUpperCase(),
      },
    });
  });

  await writeAuditLog({
    userId: actorId,
    action: 'USER_DELETED',
    resourceType: 'super_admin',
    resourceId: targetUserId,
    metadata: {
      action: 'DELETED_SUPER_ADMIN',
      username: user.admin!.username,
      email: user.email,
    },
    ...meta,
  });

  return { deleted: true, id: targetUserId };
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

/**
 * Ensure a protected root Super Admin exists (username: rootadmin).
 * Idempotent — safe to run on deploy / seed.
 */
export async function ensureRootSuperAdmin(options?: {
  password?: string;
  email?: string;
  name?: string;
}) {
  const username = 'rootadmin';
  const email = normalizeEmail(options?.email ?? process.env.ROOT_ADMIN_EMAIL ?? 'root@avichi.edu');
  const password =
    options?.password ??
    process.env.ROOT_ADMIN_PASSWORD ??
    process.env.SUPER_ADMIN_PASSWORD ??
    'Root@Admin2026!';
  const name = normalizeName(options?.name ?? 'Root Super Admin');

  const existing = await prisma.admin.findUnique({
    where: { username },
    include: { user: true },
  });

  if (existing?.user && !existing.user.deletedAt) {
    await prisma.admin.update({
      where: { id: existing.id },
      data: {
        isRoot: true,
        permissions: ALL_SUPER_ADMIN_PERMISSIONS,
      },
    });
    await prisma.user.update({
      where: { id: existing.userId },
      data: {
        role: 'SUPER_ADMIN',
        accountStatus: 'ACTIVE',
        deletedAt: null,
      },
    });
    // Ensure at least one root
    return { created: false, username, userId: existing.userId };
  }

  // Promote oldest SA if exists without rootadmin
  const oldest = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN', deletedAt: null },
    orderBy: { createdAt: 'asc' },
    include: { admin: true },
  });

  if (oldest?.admin && !existing) {
    // Create rootadmin as separate protected account
  }

  const department = await prisma.department.upsert({
    where: { name: 'Administration' },
    update: {},
    create: { name: 'Administration', code: 'ADMIN' },
  });

  // Prefer promoting the oldest Super Admin to rootadmin (no second account collision)
  if (oldest?.admin) {
    const usernameTaken = await prisma.admin.findFirst({
      where: { username, userId: { not: oldest.id } },
    });
    const targetUsername = usernameTaken ? oldest.admin.username : username;
    await prisma.admin.update({
      where: { userId: oldest.id },
      data: {
        isRoot: true,
        username: targetUsername,
        employeeId: oldest.admin.employeeId ?? 'ROOT',
        permissions: ALL_SUPER_ADMIN_PERMISSIONS,
      },
    });
    await prisma.user.update({
      where: { id: oldest.id },
      data: { role: 'SUPER_ADMIN', accountStatus: 'ACTIVE', deletedAt: null },
    });
    return {
      created: false,
      promoted: true,
      username: targetUsername,
      userId: oldest.id,
      note: 'Promoted existing Super Admin to protected root',
    };
  }

  const passwordHash = await hashPassword(password);
  const mobileHash = hashValue(`__rootadmin__:${Date.now()}`);
  const mobileEnc = encryptField('9000000000');
  const regNo = 'ROOTADMIN';

  const soft = await prisma.user.findMany({
    where: {
      deletedAt: { not: null },
      OR: [{ regNo }, { email }],
    },
  });
  for (const row of soft) {
    await prisma.user.update({
      where: { id: row.id },
      data: {
        regNo: `DEL${row.id.replace(/-/g, '').slice(0, 9)}`.slice(0, 12),
        email: `deleted+${row.id.slice(0, 8)}@invalid.local`,
        mobileHash: `deleted_${row.id}`,
      },
    });
  }

  const clash = await prisma.user.findFirst({
    where: { deletedAt: null, OR: [{ regNo }, { email }] },
  });
  if (clash) {
    throw new AppError(409, `Cannot create rootadmin — conflict with ${clash.regNo}`);
  }

  const user = await prisma.user.create({
    data: {
      regNo,
      email,
      passwordHash,
      mobileHash,
      mobileEnc,
      role: 'SUPER_ADMIN',
      departmentId: department.id,
      accountStatus: 'ACTIVE',
      forcePasswordChange: false,
      profile: { create: { name, privacy: 'PRIVATE' } },
      admin: {
        create: {
          username,
          employeeId: 'ROOT',
          permissions: ALL_SUPER_ADMIN_PERMISSIONS,
          isRoot: true,
          createdById: null,
        },
      },
    },
  });

  return {
    created: true,
    username,
    userId: user.id,
    email,
    passwordHint: 'set from ROOT_ADMIN_PASSWORD / SUPER_ADMIN_PASSWORD',
  };
}
