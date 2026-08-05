import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { listUserSessions, revokeAllSessions } from './session.service.js';
import { writeAuditLog } from './audit.service.js';
import { assertStrongPassword, hashPassword, verifyPassword } from '../utils/password.js';
import { toPublicUser } from './user.mapper.js';

const DEFAULT_SETTINGS = {
  privateAccount: false,
  whoCanMessage: 'FRIENDS',
  whoCanCall: 'FRIENDS',
  whoCanSeePosts: 'PUBLIC',
  whoCanSeeStories: 'DEPARTMENT',
  whoCanSeeProfile: 'PUBLIC',
  notifyLikes: true,
  notifyComments: true,
  notifyFriendRequests: true,
  notifyMessages: true,
  notifyCalls: true,
  notifyEvents: true,
  notifyCommunities: true,
  notifyAnnouncements: true,
  notifyReminders: true,
  pushEnabled: true,
  theme: 'system',
  accentColor: 'blue',
  fontScale: 'medium',
} as const;

async function ensureSettings(userId: string) {
  const existing = await prisma.userSettings.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.userSettings.create({
    data: { userId, ...DEFAULT_SETTINGS },
  });
}

function mapSettings(row: Awaited<ReturnType<typeof ensureSettings>>) {
  return {
    privacy: {
      privateAccount: row.privateAccount,
      whoCanMessage: row.whoCanMessage,
      whoCanCall: row.whoCanCall,
      whoCanSeePosts: row.whoCanSeePosts,
      whoCanSeeStories: row.whoCanSeeStories,
      whoCanSeeProfile: row.whoCanSeeProfile,
    },
    notifications: {
      likes: row.notifyLikes,
      comments: row.notifyComments,
      friendRequests: row.notifyFriendRequests,
      messages: row.notifyMessages,
      calls: row.notifyCalls,
      events: row.notifyEvents,
      communities: row.notifyCommunities,
      announcements: row.notifyAnnouncements,
      reminders: row.notifyReminders,
      pushEnabled: row.pushEnabled,
    },
    appearance: {
      theme: row.theme,
      accentColor: row.accentColor,
      fontScale: row.fontScale,
    },
  };
}

export async function getSettingsBundle(userId: string) {
  const [settings, user, sessions, storage] = await Promise.all([
    ensureSettings(userId),
    prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, department: true },
    }),
    listUserSessions(userId),
    getStorageUsage(userId),
  ]);

  if (!user) throw new AppError(404, 'User not found');

  return {
    account: {
      id: user.id,
      regNo: user.regNo,
      name: user.profile?.name ?? user.regNo,
      email: user.email,
      bio: user.profile?.bio ?? null,
      department: user.department.name,
      year: user.profile?.year ?? null,
      profilePhotoUrl: user.profile?.profilePhotoUrl ?? null,
      coverPhotoUrl: user.profile?.coverPhotoUrl ?? null,
      profilePrivacy: user.profile?.privacy ?? 'PUBLIC',
      mfaEnabled: user.mfaEnabled,
      accountStatus: user.accountStatus,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    },
    ...mapSettings(settings),
    sessions: sessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      deviceLabel: s.deviceLabel,
      rememberMe: s.rememberMe,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
    })),
    storage,
  };
}

export async function updatePrivacySettings(
  userId: string,
  data: Partial<{
    privateAccount: boolean;
    whoCanMessage: string;
    whoCanCall: string;
    whoCanSeePosts: string;
    whoCanSeeStories: string;
    whoCanSeeProfile: string;
  }>,
) {
  await ensureSettings(userId);
  const row = await prisma.userSettings.update({
    where: { userId },
    data: {
      privateAccount: data.privateAccount,
      whoCanMessage: data.whoCanMessage,
      whoCanCall: data.whoCanCall,
      whoCanSeePosts: data.whoCanSeePosts,
      whoCanSeeStories: data.whoCanSeeStories,
      whoCanSeeProfile: data.whoCanSeeProfile,
    },
  });

  // Sync profile privacy when private account / profile visibility changes
  if (data.privateAccount === true) {
    await prisma.profile.updateMany({
      where: { userId },
      data: { privacy: 'PRIVATE' },
    });
  } else if (data.whoCanSeeProfile) {
    const map: Record<string, 'PUBLIC' | 'FRIENDS' | 'PRIVATE'> = {
      PUBLIC: 'PUBLIC',
      FRIENDS: 'FRIENDS',
      DEPARTMENT: 'PUBLIC',
      PRIVATE: 'PRIVATE',
    };
    const privacy = map[data.whoCanSeeProfile] ?? 'PUBLIC';
    await prisma.profile.updateMany({ where: { userId }, data: { privacy } });
  }

  return mapSettings(row).privacy;
}

export async function updateNotificationSettings(
  userId: string,
  data: Partial<{
    likes: boolean;
    comments: boolean;
    friendRequests: boolean;
    messages: boolean;
    calls: boolean;
    events: boolean;
    communities: boolean;
    announcements: boolean;
    reminders: boolean;
    pushEnabled: boolean;
  }>,
) {
  await ensureSettings(userId);
  const row = await prisma.userSettings.update({
    where: { userId },
    data: {
      notifyLikes: data.likes,
      notifyComments: data.comments,
      notifyFriendRequests: data.friendRequests,
      notifyMessages: data.messages,
      notifyCalls: data.calls,
      notifyEvents: data.events,
      notifyCommunities: data.communities,
      notifyAnnouncements: data.announcements,
      notifyReminders: data.reminders,
      pushEnabled: data.pushEnabled,
    },
  });
  return mapSettings(row).notifications;
}

export async function updateAppearanceSettings(
  userId: string,
  data: Partial<{ theme: string; accentColor: string; fontScale: string }>,
) {
  await ensureSettings(userId);
  if (data.theme && !['light', 'dark', 'system'].includes(data.theme)) {
    throw new AppError(400, 'Invalid theme');
  }
  const row = await prisma.userSettings.update({
    where: { userId },
    data: {
      theme: data.theme,
      accentColor: data.accentColor,
      fontScale: data.fontScale,
    },
  });
  return mapSettings(row).appearance;
}

export async function getStorageUsage(userId: string) {
  const assets = await prisma.mediaAsset.groupBy({
    by: ['purpose'],
    where: { userId },
    _sum: { fileSize: true },
    _count: { id: true },
  });

  const byPurpose: Record<string, { bytes: number; count: number }> = {};
  let totalBytes = 0;
  let totalFiles = 0;
  for (const a of assets) {
    const bytes = a._sum.fileSize ?? 0;
    const count = a._count.id;
    byPurpose[a.purpose] = { bytes, count };
    totalBytes += bytes;
    totalFiles += count;
  }

  const limitBytes = 2 * 1024 * 1024 * 1024; // 2 GB soft campus quota for UI
  return {
    totalBytes,
    totalFiles,
    limitBytes,
    usedPercent: Math.min(100, Math.round((totalBytes / limitBytes) * 100)),
    byPurpose: {
      photos: sumPurposes(byPurpose, ['profile', 'cover', 'post_image', 'story_image']),
      videos: sumPurposes(byPurpose, ['post_video', 'story_video']),
      reels: sumPurposes(byPurpose, ['post_video']), // reels use video uploads
      documents: sumPurposes(byPurpose, ['document']),
      other: Object.entries(byPurpose)
        .filter(
          ([p]) =>
            ![
              'profile',
              'cover',
              'post_image',
              'story_image',
              'post_video',
              'story_video',
              'document',
            ].includes(p),
        )
        .reduce((acc, [, v]) => ({ bytes: acc.bytes + v.bytes, count: acc.count + v.count }), {
          bytes: 0,
          count: 0,
        }),
    },
  };
}

function sumPurposes(
  map: Record<string, { bytes: number; count: number }>,
  keys: string[],
) {
  return keys.reduce(
    (acc, k) => {
      const v = map[k];
      if (!v) return acc;
      return { bytes: acc.bytes + v.bytes, count: acc.count + v.count };
    },
    { bytes: 0, count: 0 },
  );
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
  meta?: { ipAddress?: string; userAgent?: string },
  options?: { revokeOtherSessions?: boolean },
) {
  assertStrongPassword(newPassword);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, 'User not found');
  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw new AppError(400, 'Current password is incorrect');

  const same = await verifyPassword(newPassword, user.passwordHash);
  if (same) {
    throw new AppError(400, 'New password must be different from your current password');
  }

  const wasForced = user.forcePasswordChange;
  const passwordHash = await hashPassword(newPassword);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash,
      forcePasswordChange: false,
      failedLoginCount: 0,
      lockedUntil: null,
    },
    include: { profile: true, department: true },
  });

  // Revoke every prior session (temp-password devices), then issue a fresh session
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const { createSession } = await import('./session.service.js');
  const session = await createSession(updated, {
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
    rememberMe: false,
  });

  await writeAuditLog({
    userId,
    action: 'PASSWORD_CHANGE',
    resourceType: 'user',
    resourceId: userId,
    metadata: { firstTime: wasForced, isFirstLogin: wasForced },
    ...meta,
  });

  return {
    message: wasForced
      ? 'Password set successfully. Welcome to AVICHIAN.'
      : 'Password updated',
    user: toPublicUser(updated),
    forcePasswordChange: false,
    isFirstLogin: false,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresIn: session.expiresIn,
  };
}

export async function logoutAllDevices(
  userId: string,
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const count = await revokeAllSessions(userId);
  await writeAuditLog({
    userId,
    action: 'SESSION_REVOKED',
    metadata: { allDevices: true, count },
    ...meta,
  });
  return { revoked: count };
}

export async function getLoginHistory(userId: string) {
  const rows = await prisma.loginHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true,
      success: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    success: r.success,
    ipAddress: r.ipAddress,
    userAgent: r.userAgent,
    createdAt: r.createdAt.toISOString(),
  }));
}
