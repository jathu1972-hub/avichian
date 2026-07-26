/**
 * Super Admin frontend API configuration.
 * Production: VITE_API_URL=https://api.avichian.in
 */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function getApiOrigin(): string {
  const raw = import.meta.env.VITE_API_URL as string | undefined;
  if (!raw || !raw.trim()) return '';
  return stripTrailingSlash(raw.trim());
}

export function getApiBase(): string {
  const origin = getApiOrigin();
  return origin ? `${origin}/api` : '/api';
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
