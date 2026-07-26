import { getApiBase } from './config';

function apiBase(): string {
  return getApiBase();
}

let csrfTokenCache: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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
  const res = await fetch(`${apiBase()}/csrf-token`, { credentials: 'include' });
  const json = await res.json();
  const token = json.data.csrfToken as string;
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
  } else {
    localStorage.removeItem('avichian_access_token');
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem('avichian_access_token');
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
        if (!res.ok) return null;
        const json = await res.json();
        setAccessToken(json.data.accessToken);
        if (json.data.csrfToken) {
          setCsrfToken(json.data.csrfToken);
        }
        return json.data.accessToken as string;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  retryState: { auth?: boolean; csrf?: boolean } = { auth: true, csrf: true },
): Promise<{ success: boolean; data?: T; error?: string; message?: string; code?: string }> {
  const method = (options.method ?? 'GET').toUpperCase();
  const needsCsrf = MUTATING_METHODS.has(method);
  const csrf = needsCsrf ? await ensureCsrf() : null;
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

  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  const json = await res.json().catch(() => ({ success: false, error: 'Invalid response' }));

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
  }

  if (!res.ok) {
    throw new Error(json.error ?? 'Request failed');
  }

  if (json.data?.csrfToken) {
    setCsrfToken(json.data.csrfToken);
  }

  return json;
}
