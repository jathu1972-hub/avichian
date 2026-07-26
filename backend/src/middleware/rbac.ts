import type { Response, NextFunction } from 'express';
import type { UserRole } from '@avichian/shared';
import { AUTH_ERRORS } from '@avichian/shared';
import type { AuthRequest } from './auth.js';
import { AppError } from '../utils/errors.js';

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, AUTH_ERRORS.UNAUTHORIZED));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new AppError(403, AUTH_ERRORS.FORBIDDEN));
      return;
    }

    next();
  };
}

export function requireDepartmentScope(
  getDepartmentId: (req: AuthRequest) => string | undefined,
) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError(401, AUTH_ERRORS.UNAUTHORIZED));
      return;
    }

    if (req.user.role === 'SUPER_ADMIN') {
      next();
      return;
    }

    const targetDepartmentId = getDepartmentId(req);
    if (targetDepartmentId && targetDepartmentId !== req.user.departmentId) {
      next(new AppError(403, 'Cannot access resources outside your department'));
      return;
    }

    next();
  };
}