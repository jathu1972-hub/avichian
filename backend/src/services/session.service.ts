import { randomBytes } from 'crypto';
import type { User } from '@prisma/client';
import { DEFAULT_REFRESH_DAYS, REMEMBER_ME_DAYS } from '@avichian/shared';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { hashValue } from '../utils/crypto.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { signAccessToken, getAccessTokenExpirySeconds } from '../utils/jwt.js';
import type { PublicUser } from '@avichian/shared';
import { toPublicUser } from './user.mapper.js';
import { AppError } from '../utils/errors.js';
import { assertAccountActive } from '../utils/account.js';

type UserWithProfile = User & {
  profile: {
    name: string;
    bio: string | null;
    year: number | null;
    profilePhotoUrl: string | null;
  } | null;
};

interface SessionMeta {
  ipAddress?: string;
  userAgent?: string;
  rememberMe?: boolean;
}

async function findSessionByRefreshToken(refreshToken: string) {
  const lookup = hashValue(refreshToken);
  const session = await prisma.session.findUnique({
    where: { refreshTokenLookup: lookup },
    include: {
      user: { include: { profile: true, department: true } },
    },
  });

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    return null;
  }

  const valid = await verifyPassword(refreshToken, session.refreshTokenHash);
  if (!valid) return null;

  return session;
}

export async function createSession(
  user: UserWithProfile,
  meta: SessionMeta,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number; user: PublicUser }> {
  const refreshToken = randomBytes(48).toString('hex');
  const refreshTokenHash = await hashPassword(refreshToken);
  const refreshTokenLookup = hashValue(refreshToken);
  const rememberMe = meta.rememberMe ?? false;
  const refreshDays = rememberMe ? REMEMBER_ME_DAYS : (env.refreshTokenExpiryDays || DEFAULT_REFRESH_DAYS);
  const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      userId: user.id,
      refreshTokenHash,
      refreshTokenLookup,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      rememberMe,
      expiresAt,
    },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      online: true,
      lastSeen: new Date(),
      lastLoginAt: new Date(),
      failedLoginCount: 0,
      lockedUntil: null,
    },
  });

  const accessToken = signAccessToken({
    sub: user.id,
    regNo: user.regNo,
    role: user.role,
    departmentId: user.departmentId,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: getAccessTokenExpirySeconds(),
    user: toPublicUser(user),
  };
}

export async function rotateRefreshToken(
  refreshToken: string,
  meta: SessionMeta,
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  const matchedSession = await findSessionByRefreshToken(refreshToken);

  if (!matchedSession) {
    throw new AppError(401, 'Invalid or expired refresh token');
  }

  assertAccountActive(matchedSession.user);

  await prisma.session.update({
    where: { id: matchedSession.id },
    data: { revokedAt: new Date() },
  });

  const result = await createSession(matchedSession.user, {
    ...meta,
    rememberMe: matchedSession.rememberMe,
  });

  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
  };
}

export async function revokeSession(refreshToken: string): Promise<string | null> {
  const matchedSession = await findSessionByRefreshToken(refreshToken);
  if (!matchedSession) return null;

  await prisma.session.update({
    where: { id: matchedSession.id },
    data: { revokedAt: new Date() },
  });

  const activeSessions = await prisma.session.count({
    where: { userId: matchedSession.userId, revokedAt: null, expiresAt: { gt: new Date() } },
  });

  if (activeSessions === 0) {
    await prisma.user.update({
      where: { id: matchedSession.userId },
      data: { online: false, lastSeen: new Date() },
    });
  }

  return matchedSession.userId;
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const result = await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { online: false, lastSeen: new Date() },
  });

  return result.count;
}

export function getRefreshCookieOptions(rememberMe = false) {
  const days = rememberMe ? REMEMBER_ME_DAYS : (env.refreshTokenExpiryDays || DEFAULT_REFRESH_DAYS);
  // Production: Netlify frontends call api.avichian.in cross-site → SameSite=None; Secure
  const crossSite = env.isProduction;
  return {
    httpOnly: true,
    secure: crossSite || env.isProduction,
    sameSite: (crossSite ? 'none' : 'lax') as 'none' | 'lax' | 'strict',
    path: '/api/auth',
    maxAge: days * 24 * 60 * 60 * 1000,
  };
}

export async function listUserSessions(userId: string) {
  return prisma.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: {
      id: true,
      ipAddress: true,
      userAgent: true,
      deviceLabel: true,
      rememberMe: true,
      createdAt: true,
      expiresAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}