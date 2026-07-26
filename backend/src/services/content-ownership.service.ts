import type { UserRole } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { AUTH_ERRORS } from '@avichian/shared';

export function assertCanModerate(
  actor: { id: string; role: UserRole },
  ownerId: string,
): { isOwner: boolean; isAdmin: boolean } {
  const isOwner = actor.id === ownerId;
  const isAdmin = actor.role === 'SUPER_ADMIN';
  if (!isOwner && !isAdmin) {
    throw new AppError(403, AUTH_ERRORS.FORBIDDEN, 'NOT_CONTENT_OWNER');
  }
  return { isOwner, isAdmin };
}

export function softDeleteFields(actorId: string) {
  return {
    isDeleted: true,
    deletedAt: new Date(),
    deletedById: actorId,
  };
}

export function restoreFields() {
  return {
    isDeleted: false,
    deletedAt: null,
    deletedById: null,
  };
}
