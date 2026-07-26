import type { User, Profile, Department } from '@prisma/client';
import type { PublicUser } from '@avichian/shared';

type UserWithRelations = User & {
  profile: Profile | null;
  department?: Department;
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
  };
}