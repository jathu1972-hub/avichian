import { randomBytes } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function issueCsrfToken(_req: Request, res: Response): string {
  const token = randomBytes(32).toString('hex');
  // Cross-origin Netlify → API needs SameSite=None; Secure so the browser stores/sends cookies.
  const crossSite = env.isProduction;
  res.cookie('csrf_token', token, {
    httpOnly: false,
    secure: crossSite || env.isProduction,
    sameSite: crossSite ? 'none' : 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000,
  });
  return token;
}

function logCsrfFailure(req: Request, reason: string) {
  if (env.isProduction) return;
  console.warn('[CSRF]', reason, {
    method: req.method,
    path: req.originalUrl,
    hasCookie: Boolean(req.cookies?.csrf_token),
    hasHeader: Boolean(req.get('x-csrf-token')),
    cookiePrefix: req.cookies?.csrf_token
      ? String(req.cookies.csrf_token).slice(0, 8)
      : null,
    headerPrefix: req.get('x-csrf-token')?.slice(0, 8) ?? null,
  });
}

export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.csrf_token as string | undefined;
  const headerToken = req.get('x-csrf-token');

  if (!cookieToken) {
    logCsrfFailure(req, 'missing_csrf_cookie');
    next(new AppError(403, 'CSRF validation failed: missing cookie', 'CSRF_MISSING_COOKIE'));
    return;
  }

  if (!headerToken) {
    logCsrfFailure(req, 'missing_csrf_header');
    next(new AppError(403, 'CSRF validation failed: missing header', 'CSRF_MISSING_HEADER'));
    return;
  }

  if (cookieToken !== headerToken) {
    logCsrfFailure(req, 'csrf_token_mismatch');
    next(new AppError(403, 'CSRF validation failed: token mismatch', 'CSRF_TOKEN_MISMATCH'));
    return;
  }

  next();
}