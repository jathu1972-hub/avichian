import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import type { PublicUser } from '@avichian/shared';
import {
  api,
  clearCsrfToken,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
  setCsrfToken,
} from '../lib/api';

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  establishSession: (
    accessToken: string,
    profile?: PublicUser | null,
    csrfToken?: string | null,
  ) => Promise<PublicUser | null>;
  login: (regNo: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  setUser: (user: PublicUser | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);
const BOOTSTRAP_WAIT_MS = 900;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  const establishSession = useCallback(
    async (
      accessToken: string,
      profile?: PublicUser | null,
      csrfToken?: string | null,
    ): Promise<PublicUser | null> => {
      setAccessToken(accessToken);
      if (csrfToken) setCsrfToken(csrfToken);

      if (profile) {
        if (profile.role !== 'STUDENT' && profile.role !== 'STAFF') {
          setAccessToken(null);
          flushSync(() => setUser(null));
          return null;
        }
        flushSync(() => setUser(profile));
        return profile;
      }

      try {
        const res = await api<PublicUser>('/profile/me');
        const resolved = res.data ?? null;
        if (!resolved || (resolved.role !== 'STUDENT' && resolved.role !== 'STAFF')) {
          setAccessToken(null);
          flushSync(() => setUser(null));
          return null;
        }
        flushSync(() => setUser(resolved));
        return resolved;
      } catch {
        setAccessToken(null);
        flushSync(() => setUser(null));
        return null;
      }
    },
    [],
  );

  const bootstrapSession = useCallback(async () => {
    // A slow or offline API must never keep the login form behind the splash.
    // A remembered session may still resolve in the background and redirect normally.
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        setLoading(false);
      }
    };
    const releaseTimer = window.setTimeout(release, BOOTSTRAP_WAIT_MS);

    try {
      let token = getAccessToken();
      if (!token) token = await refreshAccessToken();
      if (!token) {
        setUser(null);
        return;
      }

      const res = await api<PublicUser>('/profile/me');
      const profile = res.data ?? null;
      if (!profile || (profile.role !== 'STUDENT' && profile.role !== 'STAFF')) {
        setAccessToken(null);
        setUser(null);
        return;
      }
      setUser(profile);
    } catch {
      setAccessToken(null);
      setUser(null);
    } finally {
      window.clearTimeout(releaseTimer);
      release();
    }
  }, []);

  useEffect(() => {
    void bootstrapSession();
  }, [bootstrapSession]);

  useEffect(() => {
    if (!user || (user.role !== 'STUDENT' && user.role !== 'STAFF')) return;
    let cancelled = false;
    import('../lib/socket').then(({ connectSocket }) => {
      if (!cancelled) connectSocket();
    });
    const refreshTick = window.setInterval(() => {
      void refreshAccessToken();
    }, 10 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTick);
    };
  }, [user]);

  useEffect(() => {
    if (user) return;
    import('../lib/socket').then(({ disconnectSocket }) => disconnectSocket());
  }, [user]);

  const login = useCallback(async (regNo: string, password: string, rememberMe = false) => {
    const res = await api<{
      accessToken: string;
      user: PublicUser;
      mfaRequired?: boolean;
      mfaSetupRequired?: boolean;
      mfaToken?: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ regNo, password, rememberMe }),
    });

    if (res.data?.mfaRequired || res.data?.mfaSetupRequired) {
      throw new Error('MFA required — use the login page flow');
    }

    await establishSession(res.data!.accessToken, res.data!.user);
  }, [establishSession]);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setAccessToken(null);
      clearCsrfToken();
      flushSync(() => setUser(null));
    }
  }, []);

  const logoutAll = useCallback(async () => {
    try {
      await api('/auth/logout/all', { method: 'POST' });
    } finally {
      setAccessToken(null);
      clearCsrfToken();
      flushSync(() => setUser(null));
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, establishSession, login, logout, logoutAll, setUser }),
    [user, loading, establishSession, login, logout, logoutAll],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
