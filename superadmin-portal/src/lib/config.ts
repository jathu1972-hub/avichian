/**
 * Super Admin API configuration — same rules as student app.
 *
 * Resolution: config.json → VITE_API_URL → /api (dev proxy only).
 * Production never uses localhost / 127.0.0.1.
 */

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function isLoopbackUrl(url: string): boolean {
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
  } catch {
    return /localhost|127\.0\.0\.1/i.test(url);
  }
}

export function normalizeApiOrigin(raw: string): string {
  let url = stripTrailingSlash(raw.trim());
  if (url.toLowerCase().endsWith('/api')) {
    url = stripTrailingSlash(url.slice(0, -4));
  }
  return url;
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

export async function loadRuntimeConfig(): Promise<void> {
  if (configLoaded) return;
  configLoaded = true;

  if (import.meta.env.DEV && !isHostedStaticFrontend()) {
    const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
    if (envUrl) {
      runtimeApiOrigin = normalizeApiOrigin(envUrl);
      console.info('[AVICHIAN] Dev API from VITE_API_URL:', runtimeApiOrigin);
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
        console.error('[AVICHIAN] config.json apiUrl is localhost — not usable on public hosts');
        return;
      }
      runtimeApiOrigin = origin;
      console.info('[AVICHIAN] API origin from config.json:', runtimeApiOrigin);
    }
  } catch (err) {
    console.warn('[AVICHIAN] config.json load failed', err);
  }
}

export function getApiOrigin(): string {
  if (runtimeApiOrigin) {
    if (isProductionFrontend() && isLoopbackUrl(runtimeApiOrigin)) return '';
    return runtimeApiOrigin;
  }

  const raw = import.meta.env.VITE_API_URL as string | undefined;
  if (raw?.trim()) {
    const origin = normalizeApiOrigin(raw);
    if (isProductionFrontend() && isLoopbackUrl(origin)) {
      console.error('[AVICHIAN] VITE_API_URL is localhost in production — refused');
      return '';
    }
    return origin;
  }

  if (isProductionFrontend()) {
    console.error('[AVICHIAN] No API URL — set public/config.json or VITE_API_URL');
  }
  return '';
}

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
  if (url.startsWith('/') && origin) return `${origin}${url}`;
  return url;
}

export const API_UNREACHABLE_MESSAGE =
  'Unable to connect to the server. Please try again later.';
