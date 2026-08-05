/**
 * Classify API / network failures into user-visible causes.
 * Always prefer the real cause over a generic offline message.
 */

export type ApiErrorKind =
  | 'offline'
  | 'timeout'
  | 'cors'
  | 'html'
  | 'database'
  | 'auth_expired'
  | 'forbidden'
  | 'not_found'
  | 'upload'
  | 'server'
  | 'unknown';

export class ApiClientError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;
  readonly code?: string;

  constructor(kind: ApiErrorKind, message: string, opts?: { status?: number; code?: string }) {
    super(message);
    this.name = 'ApiClientError';
    this.kind = kind;
    this.status = opts?.status;
    this.code = opts?.code;
  }
}

export function classifyNetworkFailure(err: unknown): ApiClientError {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed')) {
    // Browser collapses CORS + offline into the same Failed to fetch
    return new ApiClientError(
      'offline',
      'Backend offline or unreachable. The API server may be down or the public tunnel expired.',
    );
  }
  if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('abort')) {
    return new ApiClientError('timeout', 'Network timeout. The server took too long to respond.');
  }
  if (lower.includes('cors') || lower.includes('cross-origin')) {
    return new ApiClientError('cors', 'CORS blocked. The API is not allowing this website origin.');
  }
  return new ApiClientError('offline', raw || 'Backend offline or unreachable.');
}

export function classifyHttpFailure(
  status: number,
  body: {
    error?: string;
    message?: string;
    code?: string;
    data?: unknown;
  } | null,
  contentHint?: 'html' | 'json' | 'other',
): ApiClientError {
  if (contentHint === 'html') {
    return new ApiClientError(
      'html',
      'Server error: API returned a web page instead of JSON. Check reverse-proxy / API URL configuration.',
      { status },
    );
  }

  const serverMsg =
    (typeof body?.error === 'string' && body.error) ||
    (typeof body?.message === 'string' && body.message) ||
    '';

  if (status === 401) {
    return new ApiClientError(
      'auth_expired',
      serverMsg || 'Authentication expired. Please sign in again.',
      { status, code: body?.code },
    );
  }
  if (status === 403) {
    return new ApiClientError('forbidden', serverMsg || 'Access denied.', {
      status,
      code: body?.code,
    });
  }
  if (status === 404) {
    return new ApiClientError('not_found', serverMsg || 'Resource not found.', { status });
  }
  if (status === 413) {
    return new ApiClientError('upload', serverMsg || 'Upload failed: file too large.', { status });
  }
  const dbStatus =
    body?.data &&
    typeof body.data === 'object' &&
    body.data !== null &&
    'database' in body.data
      ? String((body.data as { database?: string }).database ?? '')
      : '';
  if (status === 503 || dbStatus === 'disconnected' || /database/i.test(serverMsg)) {
    return new ApiClientError(
      'database',
      serverMsg || 'Database unavailable. The API is running but PostgreSQL is not connected.',
      { status },
    );
  }
  if (status >= 500) {
    return new ApiClientError('server', serverMsg || `Server error (HTTP ${status}).`, {
      status,
      code: body?.code,
    });
  }
  if (status >= 400) {
    return new ApiClientError('unknown', serverMsg || `Request failed (HTTP ${status}).`, {
      status,
      code: body?.code,
    });
  }
  return new ApiClientError('unknown', serverMsg || 'Request failed.', { status });
}

/** Read JWT exp (seconds) without verifying signature — client-side scheduling only. */
export function readJwtExpiryMs(token: string | null | undefined): number | null {
  if (!token) return null;
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    if (!json.exp) return null;
    return json.exp * 1000;
  } catch {
    return null;
  }
}
