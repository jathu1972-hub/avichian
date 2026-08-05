import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { isAppUserRole } from '../../lib/portal';
import { clearCsrfToken, setAccessToken } from '../../lib/api';

/**
 * Drop Super Admin (or unknown) sessions — never open the admin dashboard from this app.
 */
export function PortalRedirect() {
  const { user, loading, setUser } = useAuth();

  useEffect(() => {
    if (loading || !user) return;
    if (!isAppUserRole(user.role)) {
      setAccessToken(null);
      clearCsrfToken();
      setUser(null);
    }
  }, [user, loading, setUser]);

  return null;
}
