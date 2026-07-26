import type { PublicUser } from '@avichian/shared';

export function homeRouteForRole(role: PublicUser['role']): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return '/super-admin';
    case 'HOD':
      return '/hod';
    case 'STAFF':
      return '/staff';
    default:
      return '/home';
  }
}