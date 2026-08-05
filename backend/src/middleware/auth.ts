import type { Request, Response, NextFunction } from 'express';
import type { UserRole } from '@avichian/shared';
import { AUTH_ERRORS } from '@avichian/shared';
import { prisma } from '../lib/prisma.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { AppError } from '../utils/errors.js';
import { assertAccountActive } from '../utils/account.js';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    regNo: string;
    role: UserRole;
    departmentId: string;
    forcePasswordChange?: boolean;
  };
}

/** Paths allowed while forcePasswordChange is true (relative to mounted router). */
const FORCE_PASSWORD_ALLOW = [
  '/me',
  '/security/password',
  '/password',
  '/password/change',
  '/logout',
  '/logout/all',
];

export async function authenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, AUTH_ERRORS.UNAUTHORIZED);
    }

    const token = header.slice(7);
    const payload = verifyAccessToken(token);

    const user = await prisma.user.findFirst({
      where: { id: payload.sub },
      select: {
        id: true,
        regNo: true,
        role: true,
        departmentId: true,
        deletedAt: true,
        accountStatus: true,
        lockedUntil: true,
        forcePasswordChange: true,
      },
    });

    if (!user) {
      throw new AppError(401, AUTH_ERRORS.UNAUTHORIZED);
    }

    assertAccountActive(user);

    req.user = {
      id: user.id,
      regNo: user.regNo,
      role: user.role as UserRole,
      departmentId: user.departmentId,
      forcePasswordChange: user.forcePasswordChange,
    };

    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }
    next(new AppError(401, AUTH_ERRORS.UNAUTHORIZED));
  }
}

/**
 * Block API access until the user completes a required password change
 * (first login after admin-created or admin-reset credentials).
 */
export function requirePasswordReady(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user?.forcePasswordChange) {
    next();
    return;
  }
  const path = req.path || '';
  const allowed = FORCE_PASSWORD_ALLOW.some(
    (p) => path === p || path.endsWith(p) || path.includes(p),
  );
  if (allowed) {
    next();
    return;
  }
  next(
    new AppError(
      403,
      'You must set a new password before continuing',
      'FORCE_PASSWORD_CHANGE',
    ),
  );
}