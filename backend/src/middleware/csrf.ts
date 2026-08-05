import { randomBytes } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** In-memory issued tokens so login works when browsers block third-party cookies. */
const issuedTokens = new Map<string, number>();
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

function pruneIssuedTokens() {
  const now = Date.now();
  for (const [token, exp] of issuedTokens) {
    if (exp <= now) issuedTokens.delete(token);
  }
}

function rememberToken(token: string) {
  if (issuedTokens.size > 5000) pruneIssuedTokens();
  issuedTokens.set(token, Date.now() + TOKEN_TTL_MS);
}

function isKnownToken(token: string): boolean {
  const exp = issuedTokens.get(token);
  if (!exp) return false;
  if (exp <= Date.now()) {
    issuedTokens.delete(token);
    return false;
  }
  return true;
}

function originHostname(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

/** True when request Origin is on the CORS allowlist (or empty same-origin tooling). */
function isTrustedBrowserOrigin(req: Request): boolean {
  const origin = req.get('origin');
  if (!origin) {
    // Same-origin proxies / non-browser clients without Origin
    return true;
  }
  if (env.frontendUrls.includes(origin.replace(/\/+$/, ''))) return true;

  // Dev: Vite on LAN
  if (!env.isProduction) {
    try {
      const url = new URL(origin);
      const host = url.hostname;
      const port = url.port || (url.protocol === 'https:' ? '443' : '80');
      const isLoopback = host === 'localhost' || host === '127.0.0.1';
      const isPrivate =
        /^10\.\d+\.\d+\.\d+$/.test(host) ||
        /^192\.168\.\d+\.\d+$/.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host);
      if ((isLoopback || isPrivate) && ['5173', '5174'].includes(port)) return true;
    } catch {
      /* ignore */
    }
  }

  // GitHub project Pages: allow https://*.github.io when listed host matches allowlist host
  const host = originHostname(origin);
  if (host?.endsWith('.github.io')) {
    return env.frontendUrls.some((u) => {
      try {
        return new URL(u).hostname === host;
      } catch {
        return false;
      }
    });
  }

  return false;
}

export function issueCsrfToken(_req: Request, res: Response): string {
  const token = randomBytes(32).toString('hex');
  rememberToken(token);
  // Cross-origin SPA (GitHub Pages / Netlify) → API needs SameSite=None; Secure.
  const crossSite = env.crossSiteCookies;
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
    origin: req.get('origin') ?? null,
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

  if (!headerToken) {
    logCsrfFailure(req, 'missing_csrf_header');
    next(new AppError(403, 'CSRF validation failed: missing header', 'CSRF_MISSING_HEADER'));
    return;
  }

  // Preferred: classic double-submit (cookie + header)
  if (cookieToken) {
    if (cookieToken !== headerToken) {
      logCsrfFailure(req, 'csrf_token_mismatch');
      next(new AppError(403, 'CSRF validation failed: token mismatch', 'CSRF_TOKEN_MISMATCH'));
      return;
    }
    next();
    return;
  }

  // Browsers often block third-party cookies (GitHub Pages → Cloudflare tunnel API).
  // Accept a still-valid issued token + trusted Origin instead of requiring the cookie.
  if (isKnownToken(headerToken) && isTrustedBrowserOrigin(req)) {
    next();
    return;
  }

  logCsrfFailure(req, 'missing_csrf_cookie');
  next(new AppError(403, 'CSRF validation failed: missing cookie', 'CSRF_MISSING_COOKIE'));
}
