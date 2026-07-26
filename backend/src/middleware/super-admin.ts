import type { Response, NextFunction } from 'express';
import { AUTH_ERRORS } from '@avichian/shared';
import type { AuthRequest } from './auth.js';
import { AppError } from '../utils/errors.js';

export function requireSuperAdmin(
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    next(new AppError(401, AUTH_ERRORS.UNAUTHORIZED));
    return;
  }
  if (req.user.role !== 'SUPER_ADMIN') {
    next(new AppError(403, 'Access Denied'));
    return;
  }
  next();
}