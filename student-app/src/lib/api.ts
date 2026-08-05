import { getApiBase, isProductionFrontend } from './config';
import {
  ApiClientError,
  classifyHttpFailure,
  classifyNetworkFailure,
  readJwtExpiryMs,
} from './errors';

/** REST base: `/api` (dev proxy) or `https://api…/api` (production). */
function apiBase(): string {
  return getApiBase();
}

let csrfTokenCache: string | null = null;
let refreshPromise: Promise<string | null> | null = null;
let proactiveRefreshTimer: number | null = null;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Parse fetch body as JSON. Rejects HTML/SPA shells with a clear cause.
 */
export async function parseApiJson<T = Record<string, unknown>>(
  res: Response,
): Promise<{ json: T; rawText: string; isHtml: boolean }> {
  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();
  const trimmed = text.trimStart();
  const looksHtml =
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    contentType.includes('text/html');

  if (looksHtml) {
    console.error('[AVICHIAN] API returned HTML instead of JSON', {
      status: res.status,
      contentType,
      preview: trimmed.slice(0, 200),
    });
    throw classifyHttpFailure(res.status, null, 'html');
  }

  if (!trimmed) {
    if (!res.ok) {
      throw classifyHttpFailure(res.status, { error: `Empty response (HTTP ${res.status})` });
    }
    return { json: {} as T, rawText: text, isHtml: false };
  }

  if (!contentType.includes('application/json') && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    console.error('[AVICHIAN] Unexpected API body', {
      status: res.status,
      contentType,
      preview: trimmed.slice(0, 200),
    });
    throw new ApiClientError(
      'server',
      `Server returned non-JSON (HTTP ${res.status}, Content-Type: ${contentType || 'missing'}). Body: ${trimmed.slice(0, 100)}`,
      { status: res.status },
    );
  }

  try {
    return { json: JSON.parse(text) as T, rawText: text, isHtml: false };
  } catch {
    throw new ApiClientError(
      'server',
      `Invalid JSON from API (HTTP ${res.status}). Body: ${trimmed.slice(0, 100)}`,
      { status: res.status },
    );
  }
}

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function setCsrfToken(token: string | null) {
  csrfTokenCache = token;
}

export function clearCsrfToken() {
  csrfTokenCache = null;
}

export async function prefetchCsrfToken(): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/csrf-token`, { credentials: 'include' });
  } catch (err) {
    console.error('[AVICHIAN] CSRF fetch failed', err);
    throw classifyNetworkFailure(err);
  }
  const { json } = await parseApiJson<{ data?: { csrfToken?: string }; error?: string }>(res);
  if (!res.ok) {
    throw classifyHttpFailure(res.status, json);
  }
  const token = json?.data?.csrfToken;
  if (!token) {
    throw new ApiClientError('server', 'CSRF token missing from API response');
  }
  csrfTokenCache = token;
  return token;
}

async function ensureCsrf(forceRefresh = false): Promise<string> {
  if (!forceRefresh) {
    const cookieToken = readCsrfCookie();
    if (cookieToken) {
      csrfTokenCache = cookieToken;
      return cookieToken;
    }
    if (csrfTokenCache) {
      return csrfTokenCache;
    }
  }
  return prefetchCsrfToken();
}

export function setAccessToken(token: string | null) {
  if (token) {
    localStorage.setItem('avichian_access_token', token);
    scheduleProactiveRefresh(token);
  } else {
    localStorage.removeItem('avichian_access_token');
    if (proactiveRefreshTimer) {
      window.clearTimeout(proactiveRefreshTimer);
      proactiveRefreshTimer = null;
    }
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem('avichian_access_token');
}

/** Refresh access token ~60s before JWT exp (silent). */
function scheduleProactiveRefresh(token: string) {
  if (typeof window === 'undefined') return;
  if (proactiveRefreshTimer) {
    window.clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
  const expMs = readJwtExpiryMs(token);
  if (!expMs) return;
  const delay = Math.max(5_000, expMs - Date.now() - 60_000);
  proactiveRefreshTimer = window.setTimeout(() => {
    void refreshAccessToken().then((t) => {
      if (t) scheduleProactiveRefresh(t);
    });
  }, delay);
}

export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const csrf = await ensureCsrf();
        const res = await fetch(`${apiBase()}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'X-CSRF-Token': csrf },
        });
        if (!res.ok) {
          if (res.status === 401) {
            setAccessToken(null);
          }
          return null;
        }
        const { json } = await parseApiJson<{
          data?: { accessToken?: string; csrfToken?: string };
        }>(res);
        if (!json.data?.accessToken) return null;
        setAccessToken(json.data.accessToken);
        if (json.data.csrfToken) {
          setCsrfToken(json.data.csrfToken);
        }
        return json.data.accessToken;
      } catch (err) {
        console.warn('[AVICHIAN] refresh failed', err);
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

// Kick proactive refresh for existing session after reload
if (typeof window !== 'undefined') {
  const existing = localStorage.getItem('avichian_access_token');
  if (existing) scheduleProactiveRefresh(existing);
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  retryState: { auth?: boolean; csrf?: boolean; network?: boolean } = {
    auth: true,
    csrf: true,
    network: true,
  },
): Promise<{ success: boolean; data?: T; error?: string; message?: string; code?: string }> {
  const method = (options.method ?? 'GET').toUpperCase();
  const needsCsrf = MUTATING_METHODS.has(method);
  let csrf: string | null = null;
  try {
    csrf = needsCsrf ? await ensureCsrf() : null;
  } catch (err) {
    // One automatic retry after brief wait (tunnel blip)
    if (retryState.network) {
      await new Promise((r) => setTimeout(r, 800));
      return api<T>(path, options, { ...retryState, network: false });
    }
    throw err instanceof ApiClientError ? err : classifyNetworkFailure(err);
  }

  const accessToken = getAccessToken();

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (options.body && !isFormData && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (needsCsrf && csrf) {
    headers['X-CSRF-Token'] = csrf;
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${apiBase()}${path}`, {
      ...options,
      credentials: 'include',
      headers,
    });
  } catch (err) {
    console.error('[AVICHIAN] Network error', path, err);
    if (retryState.network) {
      await new Promise((r) => setTimeout(r, 1000));
      return api<T>(path, options, { ...retryState, network: false });
    }
    throw classifyNetworkFailure(err);
  }

  let parsed: {
    json: {
      success?: boolean;
      data?: T & { csrfToken?: string };
      error?: string;
      message?: string;
      code?: string;
    };
  };
  try {
    parsed = await parseApiJson(res);
  } catch (err) {
    throw err;
  }
  const json = parsed.json;

  if (
    res.status === 403 &&
    retryState.csrf &&
    needsCsrf &&
    typeof json.error === 'string' &&
    json.error.includes('CSRF')
  ) {
    await ensureCsrf(true);
    return api<T>(path, options, { ...retryState, csrf: false });
  }

  if (res.status === 401 && retryState.auth && !path.includes('/auth/refresh')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      return api<T>(path, options, { ...retryState, auth: false });
    }
    if (accessToken) {
      setAccessToken(null);
    }
    throw classifyHttpFailure(401, json);
  }

  if (!res.ok) {
    const isUpload = path.includes('upload') || isFormData;
    if (isUpload && res.status >= 400) {
      const base = classifyHttpFailure(res.status, json);
      throw new ApiClientError(
        'upload',
        base.message.startsWith('Upload') ? base.message : `Upload failed: ${base.message}`,
        { status: res.status, code: base.code },
      );
    }
    throw classifyHttpFailure(res.status, json);
  }

  if (json.data && typeof json.data === 'object' && 'csrfToken' in json.data && json.data.csrfToken) {
    setCsrfToken(json.data.csrfToken as string);
  }

  return json as { success: boolean; data?: T; error?: string; message?: string; code?: string };
}

/** @deprecated kept for call sites that imported this name */
export function networkErrorMessage(): string {
  return isProductionFrontend()
    ? 'Backend offline or unreachable. The API server may be down or the public tunnel expired.'
    : 'Backend offline or unreachable. Check API process and VITE_API_URL / Vite proxy.';
}
