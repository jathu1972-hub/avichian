import type { User } from '@prisma/client';
import { AUTH_ERRORS } from '@avichian/shared';
import { AppError } from './errors.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';

type AccountUser = Pick<User, 'id' | 'deletedAt' | 'accountStatus' | 'lockedUntil' | 'failedLoginCount'>;

/**
 * If lock window has expired, clear lock state so the user can try again.
 * Returns the (possibly updated) lockedUntil value.
 */
export async function clearExpiredLoginLock(
  user: Pick<User, 'id' | 'lockedUntil' | 'failedLoginCount'>,
): Promise<{ lockedUntil: Date | null; failedLoginCount: number }> {
  if (user.lockedUntil && user.lockedUntil <= new Date()) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        lockedUntil: null,
        failedLoginCount: 0,
      },
    });
    return { lockedUntil: null, failedLoginCount: 0 };
  }
  return {
    lockedUntil: user.lockedUntil,
    failedLoginCount: user.failedLoginCount,
  };
}

export function assertAccountActive(
  user: Pick<User, 'deletedAt' | 'accountStatus' | 'lockedUntil'>,
): void {
  if (user.deletedAt) {
    throw new AppError(403, AUTH_ERRORS.ACCOUNT_DELETED);
  }
  if (user.accountStatus === 'SUSPENDED') {
    throw new AppError(403, AUTH_ERRORS.ACCOUNT_SUSPENDED);
  }
  if (user.accountStatus === 'UNVERIFIED') {
    throw new AppError(403, AUTH_ERRORS.ACCOUNT_UNVERIFIED);
  }

  // Development: ignore lockout so testing is never blocked
  if (!env.lockoutEnabled) {
    return;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minsLeft = Math.max(
      1,
      Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000),
    );
    throw new AppError(
      423,
      `${AUTH_ERRORS.ACCOUNT_LOCKED} Try again in about ${minsLeft} minute(s).`,
    );
  }
}

export type { AccountUser };
