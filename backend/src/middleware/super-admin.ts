import type { Response, NextFunction } from 'express';
import { AUTH_ERRORS } from '@avichian/shared';
import type { AuthRequest } from './auth.js';
import { AppError } from '../utils/errors.js';
import { prisma } from '../lib/prisma.js';
import { assertAccountActive } from '../utils/account.js';

/**
 * Super Admin authorization — final authority is the database, not the JWT role claim
 * and never a role string sent by the browser.
 *
 * Allows only users who:
 *  - are authenticated (Bearer JWT → user id)
 *  - have role SUPER_ADMIN in PostgreSQL (or Admin row + auto-repair)
 *  - have an Admin profile row
 *  - account is ACTIVE
 */
export async function requireSuperAdmin(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user?.id) {
      next(new AppError(401, AUTH_ERRORS.UNAUTHORIZED));
      return;
    }

    // Re-load role + Admin profile from DB on every request (never trust body/query role)
    let row = await prisma.user.findFirst({
      where: { id: req.user.id, deletedAt: null },
      select: {
        id: true,
        regNo: true,
        email: true,
        role: true,
        departmentId: true,
        accountStatus: true,
        deletedAt: true,
        lockedUntil: true,
        forcePasswordChange: true,
        admin: { select: { id: true, isRoot: true, username: true } },
      },
    });

    if (!row) {
      next(new AppError(401, AUTH_ERRORS.UNAUTHORIZED));
      return;
    }

    // Legacy repair: Admin portal account with Admin row but wrong role (same as loginSuperAdmin)
    if (row.admin && row.role !== 'SUPER_ADMIN') {
      row = await prisma.user.update({
        where: { id: row.id },
        data: { role: 'SUPER_ADMIN' },
        select: {
          id: true,
          regNo: true,
          email: true,
          role: true,
          departmentId: true,
          accountStatus: true,
          deletedAt: true,
          lockedUntil: true,
          forcePasswordChange: true,
          admin: { select: { id: true, isRoot: true, username: true } },
        },
      });
    }

    assertAccountActive(row);

    const isSuperAdmin = row.role === 'SUPER_ADMIN' && Boolean(row.admin);
    if (!isSuperAdmin) {
      // Authenticated but not Super Admin (e.g. student token used against /api/super-admin/*)
      next(
        new AppError(
          403,
          "You don't have permission to perform this action.",
          'NOT_SUPER_ADMIN',
        ),
      );
      return;
    }

    // Keep req.user in sync with DB authority
    req.user = {
      id: row.id,
      regNo: row.regNo,
      role: 'SUPER_ADMIN',
      departmentId: row.departmentId,
      forcePasswordChange: row.forcePasswordChange,
    };

    next();
  } catch (error) {
    next(error);
  }
}
