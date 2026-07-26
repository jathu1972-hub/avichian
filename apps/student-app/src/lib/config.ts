/**
 * Frontend API / Socket configuration.
 *
 * Development: empty base → relative `/api` via Vite proxy to localhost:4000.
 * Production (Netlify): set VITE_API_URL=https://api.avichian.in (no trailing slash).
 * Never put secrets in VITE_* variables.
 */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Origin of the API, e.g. https://api.avichian.in — empty in local dev. */
export function getApiOrigin(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined;
  if (!raw || !raw.trim()) return '';
  return stripTrailingSlash(raw.trim());
}

/**
 * Base path for REST calls.
 * Local: `/api`
 * Prod: `https://api.avichian.in/api`
 */
export function getApiBase(): string {
  const origin = getApiOrigin();
  return origin ? `${origin}/api` : '/api';
}

/** Socket.IO connection URL (origin only; path is /socket.io). */
export function getSocketUrl(): string | undefined {
  const origin = getApiOrigin();
  return origin || undefined;
}

/** Resolve relative `/api/media/...` URLs against the API origin for Netlify hosting. */
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
