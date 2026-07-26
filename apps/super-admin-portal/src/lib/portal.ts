import {
  type PortalUrls,
  devPortalUrlsForHost,
  homePathForRole,
  type UserRole,
} from '@avichian/shared';

export function getPortalUrls(): PortalUrls {
  const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
  const defaults = devPortalUrlsForHost(host);
  return {
    app: import.meta.env.VITE_APP_URL ?? defaults.app,
    superAdmin: import.meta.env.VITE_SUPER_ADMIN_PORTAL_URL ?? defaults.superAdmin,
  };
}

export function homeRouteForRole(role: UserRole): string {
  return homePathForRole(role);
}
