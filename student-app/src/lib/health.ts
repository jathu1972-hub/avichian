import { getApiBase } from './config';
import { ApiClientError, classifyNetworkFailure } from './errors';

export type HealthStatus = 'checking' | 'ok' | 'error';

export interface HealthResult {
  status: HealthStatus;
  message?: string;
  data?: {
    status?: string;
    database?: string;
    server?: string;
    time?: string;
  };
}

/**
 * Ping GET /api/health. Returns a specific cause when unhealthy.
 */
export async function checkApiHealth(): Promise<HealthResult> {
  let base: string;
  try {
    base = getApiBase();
  } catch (err) {
    return {
      status: 'error',
      message:
        err instanceof Error
          ? err.message
          : 'API URL is not configured. Set public/config.json apiUrl to your backend.',
    };
  }

  try {
    const res = await fetch(`${base}/health`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const contentType = res.headers.get('content-type') ?? '';
    const text = await res.text();

    if (contentType.includes('text/html') || text.trimStart().startsWith('<')) {
      return {
        status: 'error',
        message:
          'Server error: health endpoint returned HTML instead of JSON. API URL may be wrong.',
      };
    }

    let json: {
      success?: boolean;
      status?: string;
      database?: string;
      server?: string;
      time?: string;
      data?: { status?: string; database?: string; server?: string; time?: string };
    };
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      return {
        status: 'error',
        message: `Invalid health response (HTTP ${res.status}).`,
      };
    }

    const db = json.data?.database ?? json.database;
    const status = json.data?.status ?? json.status;
    const server = json.data?.server ?? json.server ?? 'running';

    if (!res.ok || status === 'degraded' || (db && db !== 'connected')) {
      if (db === 'disconnected') {
        return {
          status: 'error',
          message: 'Database unavailable. The API is running but PostgreSQL is not connected.',
          data: { status, database: db, server, time: json.time ?? json.data?.time },
        };
      }
      return {
        status: 'error',
        message: `Backend unhealthy (HTTP ${res.status}).`,
        data: { status, database: db, server },
      };
    }

    return {
      status: 'ok',
      data: {
        status: status ?? 'ok',
        database: db ?? 'connected',
        server,
        time: json.time ?? json.data?.time,
      },
    };
  } catch (err) {
    console.error('[AVICHIAN] Health check network error', err);
    const classified = err instanceof ApiClientError ? err : classifyNetworkFailure(err);
    return { status: 'error', message: classified.message };
  }
}
