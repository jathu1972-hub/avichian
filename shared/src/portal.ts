import type { UserRole } from './types/user.js';

/**
 * Two-app architecture:
 * - AVICHIAN App (students + staff) — app / student-app
 * - Super Admin Dashboard — super-admin-portal
 */
export interface PortalUrls {
  app: string;
  superAdmin: string;
}

export const DEFAULT_DEV_PORTALS: PortalUrls = {
  app: 'http://localhost:5173',
  superAdmin: 'http://localhost:5174',
};

/** @deprecated use DEFAULT_DEV_PORTALS.app */
export const DEFAULT_DEV_PORTALS_LEGACY = {
  student: DEFAULT_DEV_PORTALS.app,
  superAdmin: DEFAULT_DEV_PORTALS.superAdmin,
  hod: DEFAULT_DEV_PORTALS.app,
  staff: DEFAULT_DEV_PORTALS.app,
};

export function devPortalUrlsForHost(hostname = 'localhost'): PortalUrls {
  const host = hostname || 'localhost';
  return {
    app: `http://${host}:5173`,
    superAdmin: `http://${host}:5174`,
  };
}

const HOME_PATHS: Record<UserRole, string> = {
  STUDENT: '/home',
  STAFF: '/home',
  SUPER_ADMIN: '/',
};

export function homePathForRole(role: UserRole): string {
  return HOME_PATHS[role] ?? '/home';
}

export function portalBaseUrlForRole(role: UserRole, portals: PortalUrls = DEFAULT_DEV_PORTALS): string {
  if (role === 'SUPER_ADMIN') return portals.superAdmin;
  return portals.app;
}

export function portalHomeUrlForRole(
  role: UserRole,
  portals: PortalUrls = DEFAULT_DEV_PORTALS,
): string {
  const base = portalBaseUrlForRole(role, portals).replace(/\/$/, '');
  const path = homePathForRole(role);
  return `${base}${path}`;
}

export function redirectToRolePortal(
  role: UserRole,
  portals: PortalUrls = DEFAULT_DEV_PORTALS,
): void {
  window.location.assign(portalHomeUrlForRole(role, portals));
}

export type AppPortal = 'app' | 'super-admin';

const PORTAL_ROLES: Record<AppPortal, UserRole[]> = {
  app: ['STUDENT', 'STAFF'],
  'super-admin': ['SUPER_ADMIN'],
};

export function isRoleAllowedOnPortal(role: UserRole, portal: AppPortal): boolean {
  return PORTAL_ROLES[portal].includes(role);
}

export type PostAuthDestination = string | 'redirect';

export function resolvePostAuthDestination(
  role: UserRole,
  portal: AppPortal,
  portals: PortalUrls = DEFAULT_DEV_PORTALS,
): PostAuthDestination {
  if (!isRoleAllowedOnPortal(role, portal)) {
    redirectToRolePortal(role, portals);
    return 'redirect';
  }
  return homePathForRole(role);
}
