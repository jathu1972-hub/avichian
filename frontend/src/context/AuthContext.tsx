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
  prefetchCsrfToken,
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
      if (csrfToken) {
        setCsrfToken(csrfToken);
      }

      if (profile) {
        flushSync(() => setUser(profile));
        return profile;
      }

      try {
        const res = await api<PublicUser>('/profile/me');
        const resolved = res.data ?? null;
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
    try {
      await prefetchCsrfToken();
      let token = getAccessToken();
      if (!token) {
        token = await refreshAccessToken();
      }
      if (!token) {
        setUser(null);
        return;
      }

      const res = await api<PublicUser>('/profile/me');
      setUser(res.data ?? null);
    } catch {
      setAccessToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrapSession();
  }, [bootstrapSession]);

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