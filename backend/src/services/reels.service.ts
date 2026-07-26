import type { PostVisibility, UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { sanitizeText } from '@avichian/shared';
import { AppError } from '../utils/errors.js';
import { getFriendIds } from './friends.service.js';
import { writeAuditLog } from './audit.service.js';
import { assertCanModerate, softDeleteFields } from './content-ownership.service.js';

const authorSelect = {
  id: true,
  regNo: true,
  departmentId: true,
  profile: { select: { name: true, profilePhotoUrl: true, year: true } },
  department: { select: { name: true } },
} as const;

export async function createReel(
  authorId: string,
  data: {
    mediaUrl: string;
    caption?: string;
    coverUrl?: string;
    visibility?: PostVisibility;
  },
) {
  if (!data.mediaUrl?.trim()) throw new AppError(400, 'mediaUrl is required');

  const reel = await prisma.reel.create({
    data: {
      authorId,
      mediaUrl: data.mediaUrl.trim(),
      coverUrl: data.coverUrl ?? null,
      caption: data.caption ? sanitizeText(data.caption, 500) : null,
      visibility: data.visibility ?? 'DEPARTMENT',
    },
    include: {
      author: { select: authorSelect },
      likes: { where: { userId: authorId }, select: { id: true } },
      _count: { select: { likes: true } },
    },
  });

  return mapReel(reel, authorId);
}

export async function listReels(viewerId: string, departmentId: string, limit = 30) {
  const friendIds = await getFriendIds(viewerId);
  const hidden = await prisma.contentHide.findMany({
    where: { userId: viewerId, targetType: 'REEL' },
    select: { targetId: true },
  });
  const hiddenIds = hidden.map((h) => h.targetId);

  const reels = await prisma.reel.findMany({
    where: {
      isDeleted: false,
      deletedAt: null,
      archivedAt: null,
      ...(hiddenIds.length ? { id: { notIn: hiddenIds } } : {}),
      OR: [
        { authorId: viewerId },
        { visibility: 'PUBLIC' },
        { visibility: 'DEPARTMENT', author: { departmentId } },
        { visibility: 'FRIENDS', authorId: { in: friendIds } },
      ],
    },
    include: {
      author: { select: authorSelect },
      likes: { where: { userId: viewerId }, select: { id: true } },
      _count: { select: { likes: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return reels.map((r) => mapReel(r, viewerId));
}

export async function updateReel(
  actor: { id: string; role: UserRole },
  reelId: string,
  data: { caption?: string; coverUrl?: string | null; visibility?: PostVisibility },
  meta: { ipAddress?: string; userAgent?: string },
) {
  const reel = await prisma.reel.findFirst({ where: { id: reelId, isDeleted: false } });
  if (!reel) throw new AppError(404, 'Reel not found');
  assertCanModerate(actor, reel.authorId);

  const updated = await prisma.reel.update({
    where: { id: reelId },
    data: {
      ...(data.caption !== undefined
        ? { caption: data.caption ? sanitizeText(data.caption, 500) : null }
        : {}),
      ...(data.coverUrl !== undefined ? { coverUrl: data.coverUrl } : {}),
      ...(data.visibility !== undefined ? { visibility: data.visibility } : {}),
    },
    include: {
      author: { select: authorSelect },
      likes: { where: { userId: actor.id }, select: { id: true } },
      _count: { select: { likes: true } },
    },
  });

  await writeAuditLog({
    userId: actor.id,
    action: 'USER_UPDATED',
    resourceType: 'reel',
    resourceId: reelId,
    metadata: { ownerId: reel.authorId, fields: Object.keys(data) },
    ...meta,
  });

  return mapReel(updated, actor.id);
}

export async function deleteReelOwned(
  actor: { id: string; role: UserRole },
  reelId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const reel = await prisma.reel.findFirst({ where: { id: reelId, isDeleted: false } });
  if (!reel) throw new AppError(404, 'Reel not found');
  assertCanModerate(actor, reel.authorId);

  await prisma.reel.update({
    where: { id: reelId },
    data: softDeleteFields(actor.id),
  });

  await writeAuditLog({
    userId: actor.id,
    action: 'CONTENT_DELETED',
    resourceType: 'reel',
    resourceId: reelId,
    metadata: { ownerId: reel.authorId, byOwner: actor.id === reel.authorId, soft: true },
    ...meta,
  });

  return { message: 'Reel deleted successfully.', id: reelId };
}

export async function archiveReel(
  actor: { id: string; role: UserRole },
  reelId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const reel = await prisma.reel.findFirst({ where: { id: reelId, isDeleted: false } });
  if (!reel) throw new AppError(404, 'Reel not found');
  assertCanModerate(actor, reel.authorId);

  await prisma.reel.update({
    where: { id: reelId },
    data: { archivedAt: new Date() },
  });

  await writeAuditLog({
    userId: actor.id,
    action: 'CONTENT_ARCHIVED',
    resourceType: 'reel',
    resourceId: reelId,
    metadata: { ownerId: reel.authorId },
    ...meta,
  });

  return { message: 'Reel archived.', id: reelId };
}

export async function hideReel(userId: string, reelId: string) {
  await prisma.contentHide.upsert({
    where: {
      userId_targetType_targetId: { userId, targetType: 'REEL', targetId: reelId },
    },
    create: { userId, targetType: 'REEL', targetId: reelId },
    update: {},
  });
  return { message: 'Reel hidden.' };
}

export async function reportReel(reporterId: string, reelId: string, reason: string, details?: string) {
  const reel = await prisma.reel.findFirst({ where: { id: reelId, isDeleted: false } });
  if (!reel) throw new AppError(404, 'Reel not found');

  const validReasons = new Set([
    'SPAM',
    'HARASSMENT',
    'BULLYING',
    'VIOLENCE',
    'FAKE_ACCOUNT',
    'ADULT_CONTENT',
    'ILLEGAL_CONTENT',
    'SCAM',
    'INAPPROPRIATE',
    'OTHER',
  ]);
  const reportReason = validReasons.has(reason) ? reason : 'OTHER';

  const report = await prisma.contentReport.create({
    data: {
      reporterId,
      targetType: 'POST',
      targetId: reelId,
      targetUserId: reel.authorId,
      reason: reportReason as 'OTHER',
      details: details ? `REEL: ${details}` : 'REEL report',
    },
  });

  await writeAuditLog({
    userId: reporterId,
    action: 'CONTENT_REPORTED',
    resourceType: 'reel',
    resourceId: reelId,
    metadata: { reportId: report.id, reason: reportReason },
  });

  return { message: 'Report submitted.', id: report.id };
}

export async function toggleReelLike(userId: string, reelId: string) {
  const reel = await prisma.reel.findFirst({ where: { id: reelId, isDeleted: false } });
  if (!reel) throw new AppError(404, 'Reel not found');

  const existing = await prisma.reelLike.findUnique({
    where: { reelId_userId: { reelId, userId } },
  });
  if (existing) {
    await prisma.reelLike.delete({ where: { id: existing.id } });
    return { liked: false, likeCount: await prisma.reelLike.count({ where: { reelId } }) };
  }
  await prisma.reelLike.create({ data: { reelId, userId } });
  return { liked: true, likeCount: await prisma.reelLike.count({ where: { reelId } }) };
}

function mapReel(
  reel: {
    id: string;
    authorId: string;
    caption: string | null;
    mediaUrl: string;
    coverUrl: string | null;
    visibility: PostVisibility;
    createdAt: Date;
    author: {
      id: string;
      regNo: string;
      departmentId: string;
      profile: { name: string; profilePhotoUrl: string | null; year: number | null } | null;
      department: { name: string };
    };
    likes: Array<{ id: string }>;
    _count: { likes: number };
  },
  viewerId: string,
) {
  return {
    id: reel.id,
    ownerId: reel.authorId,
    caption: reel.caption,
    mediaUrl: reel.mediaUrl,
    coverUrl: reel.coverUrl,
    visibility: reel.visibility,
    createdAt: reel.createdAt.toISOString(),
    likeCount: reel._count.likes,
    likedByMe: reel.likes.length > 0,
    isMine: reel.authorId === viewerId,
    author: {
      id: reel.author.id,
      regNo: reel.author.regNo,
      name: reel.author.profile?.name ?? reel.author.regNo,
      department: reel.author.department.name,
      year: reel.author.profile?.year ?? null,
      profilePhotoUrl: reel.author.profile?.profilePhotoUrl ?? null,
    },
  };
}
