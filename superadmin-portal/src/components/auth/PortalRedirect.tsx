import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { clearCsrfToken, setAccessToken } from '../../lib/api';

/** Super Admin dashboard only — drop non-admin sessions. */
export function PortalRedirect() {
  const { user, loading, setUser } = useAuth();

  useEffect(() => {
    if (loading || !user) return;
    if (user.role !== 'SUPER_ADMIN') {
      setAccessToken(null);
      clearCsrfToken();
      setUser(null);
    }
  }, [user, loading, setUser]);

  return null;
}
