/**
 * AVICHIAN API configuration (student app).
 *
 * Resolution order for API base (…/api):
 * 1. Runtime public/config.json → { "apiUrl": "https://api.example.com" }
 * 2. Build-time import.meta.env.VITE_API_URL
 * 3. Development only: relative `/api` (Vite proxy → backend)
 *
 * Production / GitHub Pages NEVER uses localhost or 127.0.0.1.
 */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** True if URL points at loopback (forbidden in production browsers on public hosts). */
export function isLoopbackUrl(url: string): boolean {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

/**
 * Normalize any configured value to an API origin without trailing /api.
 * Accepts: https://api.example.com  OR  https://api.example.com/api
 */
export function normalizeApiOrigin(raw: string): string {
  let url = stripTrailingSlash(raw.trim());
  if (url.toLowerCase().endsWith('/api')) {
    url = stripTrailingSlash(url.slice(0, -4));
  }
  return url;
}

/** Full REST prefix ending with /api */
export function toApiBase(originOrBase: string): string {
  const origin = normalizeApiOrigin(originOrBase);
  return `${origin}/api`;
}

function isHostedStaticFrontend(): boolean {
  if (typeof window === 'undefined') return Boolean(import.meta.env.PROD);
  const h = window.location.hostname;
  return (
    h.includes('github.io') ||
    h.includes('netlify.app') ||
    h.includes('vercel.app') ||
    h.includes('pages.dev')
  );
}

export function isProductionFrontend(): boolean {
  return Boolean(import.meta.env.PROD) || isHostedStaticFrontend();
}

let runtimeApiOrigin = '';
let configLoaded = false;

/**
 * Load optional runtime config (cache-busted). Call once before first API request.
 * public/config.json → { "apiUrl": "https://your-api-origin" }
 */
export async function loadRuntimeConfig(): Promise<void> {
  if (configLoaded) return;
  configLoaded = true;

  // Local Vite: prefer proxy unless VITE_API_URL is set in .env.development
  if (import.meta.env.DEV && !isHostedStaticFrontend()) {
    const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
    if (envUrl) {
      const origin = normalizeApiOrigin(envUrl);
      if (!isLoopbackUrl(origin) || import.meta.env.DEV) {
        runtimeApiOrigin = origin;
        console.info('[AVICHIAN] Dev API from VITE_API_URL:', runtimeApiOrigin);
      }
    } else {
      console.info('[AVICHIAN] Dev mode: using Vite /api proxy');
    }
    return;
  }

  try {
    const base = import.meta.env.BASE_URL || '/';
    const res = await fetch(`${base}config.json?v=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) {
      console.warn('[AVICHIAN] config.json not found (HTTP', res.status, ')');
      return;
    }
    const text = (await res.text()).replace(/^\uFEFF/, '');
    const json = JSON.parse(text) as { apiUrl?: string; VITE_API_URL?: string };
    const raw = json.apiUrl || json.VITE_API_URL;
    if (raw?.trim()) {
      const origin = normalizeApiOrigin(raw);
      if (isProductionFrontend() && isLoopbackUrl(origin)) {
        console.error(
          '[AVICHIAN] config.json apiUrl points at localhost — browsers on public sites cannot use it. Use a public HTTPS API URL.',
        );
        return;
      }
      runtimeApiOrigin = origin;
      console.info('[AVICHIAN] API origin from config.json:', runtimeApiOrigin);
    }
  } catch (err) {
    console.warn('[AVICHIAN] config.json load failed', err);
  }
}

/** Origin only, e.g. https://api.example.com — empty in pure Vite-proxy dev. */
export function getApiOrigin(): string {
  if (runtimeApiOrigin) {
    if (isProductionFrontend() && isLoopbackUrl(runtimeApiOrigin)) {
      console.error('[AVICHIAN] Refusing loopback API origin in production');
      return '';
    }
    return runtimeApiOrigin;
  }

  const raw = import.meta.env.VITE_API_URL as string | undefined;
  if (raw?.trim()) {
    const origin = normalizeApiOrigin(raw);
    if (isProductionFrontend() && isLoopbackUrl(origin)) {
      console.error(
        '[AVICHIAN] VITE_API_URL is localhost in production build — set a public HTTPS API URL and redeploy.',
      );
      return '';
    }
    return origin;
  }

  if (isProductionFrontend()) {
    console.error(
      '[AVICHIAN] No API URL configured. Set public/config.json { "apiUrl": "https://YOUR-API" } or VITE_API_URL.',
    );
  }
  return '';
}

/**
 * Base path for REST: `https://api…/api` or `/api` in local proxy dev.
 */
export function getApiBase(): string {
  const origin = getApiOrigin();
  if (origin) return `${origin}/api`;

  if (isProductionFrontend()) {
    throw new Error(
      'Unable to connect to the server. The application is not configured with a production API URL.',
    );
  }
  return '/api';
}

export function isCrossOriginApi(): boolean {
  return Boolean(getApiOrigin());
}

export function getSocketUrl(): string | undefined {
  const origin = getApiOrigin();
  return origin || undefined;
}

export function resolveMediaUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:') ||
    url.startsWith('blob:')
  ) {
    return url;
  }
  const origin = getApiOrigin();
  if (url.startsWith('/') && origin) {
    return `${origin}${url}`;
  }
  return url;
}

/** User-facing network error (never mentions localhost / ports). */
export const API_UNREACHABLE_MESSAGE =
  'Unable to connect to the server. Please try again later.';
