/**
 * AVICHIAN App — students and staff only.
 * Super Admin uses a separate dashboard. Never link there from this app.
 */

export type AppHomePath = '/home';

export function appHomePath(): AppHomePath {
  return '/home';
}

/** Roles allowed in the AVICHIAN mobile/web app. */
export function isAppUserRole(role: string | undefined | null): boolean {
  return role === 'STUDENT' || role === 'STAFF';
}

export function isStaffRole(role: string | undefined | null): boolean {
  return role === 'STAFF';
}

export function isStudentRole(role: string | undefined | null): boolean {
  return role === 'STUDENT';
}
