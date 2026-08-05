import type { User } from '@prisma/client';
import type { PublicUser } from '@avichian/shared';

/** Minimal profile/department shapes accepted for public user mapping (login, sessions). */
type UserWithRelations = User & {
  profile: {
    name: string;
    bio?: string | null;
    year?: number | null;
    profilePhotoUrl?: string | null;
    coverPhotoUrl?: string | null;
  } | null;
  department?: { name: string } | null;
};

export function toPublicUser(user: UserWithRelations): PublicUser {
  return {
    id: user.id,
    regNo: user.regNo,
    name: user.profile?.name ?? user.regNo,
    email: user.email,
    role: user.role,
    department: user.department?.name ?? '',
    year: user.profile?.year ?? null,
    profilePhotoUrl: user.profile?.profilePhotoUrl ?? null,
    coverPhotoUrl: user.profile?.coverPhotoUrl ?? null,
    bio: user.profile?.bio ?? null,
    online: user.online,
    lastSeen: user.lastSeen?.toISOString() ?? null,
    forcePasswordChange: Boolean(user.forcePasswordChange),
    /** Same as forcePasswordChange — first login / admin temp password gate */
    isFirstLogin: Boolean(user.forcePasswordChange),
  };
}