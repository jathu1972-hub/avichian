import type { PostVisibility, UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { sanitizeText } from '@avichian/shared';
import { AppError } from '../utils/errors.js';
import { getFriendIds } from './friends.service.js';
import { writeAuditLog } from './audit.service.js';
import { assertCanModerate, softDeleteFields } from './content-ownership.service.js';
import {
  maxBytesForPurpose,
  normalizeMimeType,
  storeUpload,
} from './storage.service.js';

const authorSelect = {
  id: true,
  regNo: true,
  departmentId: true,
  profile: { select: { name: true, profilePhotoUrl: true, year: true } },
  department: { select: { name: true } },
} as const;

const REEL_MAX_BYTES = 100 * 1024 * 1024; // 100 MB
const REEL_MAX_DURATION_SEC = 90;

function parseHashtags(input?: string[] | string | null): string[] {
  if (!input) return [];
  const raw = Array.isArray(input)
    ? input
    : input.split(/[\s,]+/).map((s) => s.trim());
  const tags = raw
    .map((t) => t.replace(/^#/, '').toLowerCase().replace(/[^a-z0-9_]/g, ''))
    .filter((t) => t.length >= 1 && t.length <= 40);
  return [...new Set(tags)].slice(0, 20);
}

function visibilityFilter(viewerId: string, departmentId: string, friendIds: string[]) {
  return {
    OR: [
      { authorId: viewerId },
      { visibility: 'PUBLIC' as const },
      { visibility: 'DEPARTMENT' as const, author: { departmentId } },
      { visibility: 'FRIENDS' as const, authorId: { in: friendIds } },
    ],
  };
}

export async function createReel(
  authorId: string,
  data: {
    mediaUrl: string;
    mediaMimeType?: string | null;
    caption?: string;
    coverUrl?: string;
    hashtags?: string[] | string;
    audioName?: string;
    durationSec?: number | null;
    visibility?: PostVisibility;
  },
) {
  if (!data.mediaUrl?.trim()) throw new AppError(400, 'mediaUrl is required');
  if (data.durationSec != null && data.durationSec > REEL_MAX_DURATION_SEC) {
    throw new AppError(400, `Reels must be ${REEL_MAX_DURATION_SEC} seconds or shorter`, 'REEL_TOO_LONG');
  }

  const reel = await prisma.reel.create({
    data: {
      authorId,
      mediaUrl: data.mediaUrl.trim(),
      mediaMimeType: data.mediaMimeType ?? null,
      coverUrl: data.coverUrl ?? null,
      caption: data.caption ? sanitizeText(data.caption, 500) : null,
      hashtags: parseHashtags(data.hashtags),
      audioName: data.audioName ? sanitizeText(data.audioName, 80) : null,
      durationSec: data.durationSec ?? null,
      visibility: data.visibility ?? 'DEPARTMENT',
    },
    include: {
      author: { select: authorSelect },
      likes: { where: { userId: authorId }, select: { id: true } },
      _count: { select: { likes: true, comments: true, saves: true } },
    },
  });

  return mapReel(reel, authorId);
}

/** Multipart create: video (+ optional cover) validated, stored, DB row. */
export async function createReelWithFiles(
  authorId: string,
  files: {
    video: { buffer: Buffer; mimetype: string; originalname: string; size: number };
    cover?: { buffer: Buffer; mimetype: string; originalname: string; size: number };
  },
  meta: {
    caption?: string;
    hashtags?: string;
    audioName?: string;
    durationSec?: number;
    visibility?: PostVisibility;
  },
) {
  const mime = normalizeMimeType(files.video.mimetype, files.video.originalname);
  if (!mime.startsWith('video/')) {
    throw new AppError(400, 'Reels must be video (MP4 H.264 or WebM)', 'INVALID_MIME');
  }
  if (mime.includes('quicktime') || files.video.originalname.toLowerCase().endsWith('.mov')) {
    // Allow mov only if we store as quicktime — prefer rejecting for browser compat
    // Keep allowed for now if type is video/*
  }
  if (files.video.size > REEL_MAX_BYTES) {
    throw new AppError(400, 'Reels must be 100MB or smaller', 'FILE_TOO_LARGE');
  }
  if (meta.durationSec != null && meta.durationSec > REEL_MAX_DURATION_SEC) {
    throw new AppError(400, `Maximum duration is ${REEL_MAX_DURATION_SEC} seconds`, 'REEL_TOO_LONG');
  }

  const maxVideo = Math.min(maxBytesForPurpose('post_video'), REEL_MAX_BYTES);
  if (files.video.size > maxVideo) {
    throw new AppError(400, 'Video exceeds size limit', 'FILE_TOO_LARGE');
  }

  const videoStored = await storeUpload({
    purpose: 'post_video',
    buffer: files.video.buffer,
    mimeType: files.video.mimetype,
    originalName: files.video.originalname || 'reel.mp4',
    userId: authorId,
  });

  let coverUrl: string | null = null;
  if (files.cover) {
    const coverMime = normalizeMimeType(files.cover.mimetype, files.cover.originalname);
    if (!coverMime.startsWith('image/')) {
      throw new AppError(400, 'Cover must be an image', 'INVALID_COVER');
    }
    const coverStored = await storeUpload({
      purpose: 'post_image',
      buffer: files.cover.buffer,
      mimeType: files.cover.mimetype,
      originalName: files.cover.originalname || 'cover.jpg',
      userId: authorId,
    });
    coverUrl = coverStored.url;
  }

  return createReel(authorId, {
    mediaUrl: videoStored.url,
    mediaMimeType: videoStored.mimeType,
    coverUrl: coverUrl ?? undefined,
    caption: meta.caption,
    hashtags: meta.hashtags,
    audioName: meta.audioName,
    durationSec: meta.durationSec,
    visibility: meta.visibility,
  });
}

export async function listReels(
  viewerId: string,
  departmentId: string,
  opts?: { limit?: number; cursor?: string; search?: string; hashtag?: string },
) {
  const limit = Math.min(opts?.limit ?? 30, 50);
  const friendIds = await getFriendIds(viewerId);
  const hidden = await prisma.contentHide.findMany({
    where: { userId: viewerId, targetType: 'REEL' },
    select: { targetId: true },
  });
  const hiddenIds = hidden.map((h) => h.targetId);

  const search = opts?.search?.trim();
  const hashtag = opts?.hashtag?.replace(/^#/, '').toLowerCase();

  const reels = await prisma.reel.findMany({
    where: {
      isDeleted: false,
      deletedAt: null,
      archivedAt: null,
      ...(hiddenIds.length ? { id: { notIn: hiddenIds } } : {}),
      ...visibilityFilter(viewerId, departmentId, friendIds),
      ...(opts?.cursor ? { createdAt: { lt: new Date(opts.cursor) } } : {}),
      ...(hashtag ? { hashtags: { has: hashtag } } : {}),
      ...(search
        ? {
            OR: [
              { caption: { contains: search, mode: 'insensitive' } },
              { hashtags: { has: search.replace(/^#/, '').toLowerCase() } },
              {
                author: {
                  profile: { name: { contains: search, mode: 'insensitive' } },
                },
              },
              {
                author: {
                  department: { name: { contains: search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      author: { select: authorSelect },
      likes: { where: { userId: viewerId }, select: { id: true } },
      saves: { where: { userId: viewerId }, select: { id: true } },
      _count: { select: { likes: true, comments: true, saves: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const hasMore = reels.length > limit;
  const page = hasMore ? reels.slice(0, limit) : reels;
  const items = page.map((r) => mapReel(r, viewerId));
  const nextCursor = hasMore ? items[items.length - 1]?.createdAt ?? null : null;
  return { items, nextCursor };
}

export async function getReelById(viewerId: string, departmentId: string, reelId: string) {
  const friendIds = await getFriendIds(viewerId);
  const reel = await prisma.reel.findFirst({
    where: {
      id: reelId,
      isDeleted: false,
      deletedAt: null,
      archivedAt: null,
      ...visibilityFilter(viewerId, departmentId, friendIds),
    },
    include: {
      author: { select: authorSelect },
      likes: { where: { userId: viewerId }, select: { id: true } },
      saves: { where: { userId: viewerId }, select: { id: true } },
      _count: { select: { likes: true, comments: true, saves: true } },
    },
  });
  if (!reel) throw new AppError(404, 'Reel not found');
  return mapReel(reel, viewerId);
}

export async function recordReelView(reelId: string) {
  await prisma.reel.updateMany({
    where: { id: reelId, isDeleted: false },
    data: { viewCount: { increment: 1 } },
  });
  return { ok: true };
}

export async function updateReel(
  actor: { id: string; role: UserRole },
  reelId: string,
  data: {
    caption?: string;
    coverUrl?: string | null;
    visibility?: PostVisibility;
    hashtags?: string[] | string;
    audioName?: string | null;
  },
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
      ...(data.hashtags !== undefined ? { hashtags: parseHashtags(data.hashtags) } : {}),
      ...(data.audioName !== undefined
        ? { audioName: data.audioName ? sanitizeText(data.audioName, 80) : null }
        : {}),
    },
    include: {
      author: { select: authorSelect },
      likes: { where: { userId: actor.id }, select: { id: true } },
      saves: { where: { userId: actor.id }, select: { id: true } },
      _count: { select: { likes: true, comments: true, saves: true } },
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

export async function restoreReel(
  actor: { id: string; role: UserRole },
  reelId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  if (actor.role !== 'SUPER_ADMIN') throw new AppError(403, 'Super Admin only');
  const reel = await prisma.reel.findFirst({ where: { id: reelId } });
  if (!reel) throw new AppError(404, 'Reel not found');

  await prisma.reel.update({
    where: { id: reelId },
    data: { isDeleted: false, deletedAt: null, deletedById: null, archivedAt: null },
  });

  await writeAuditLog({
    userId: actor.id,
    action: 'CONTENT_RESTORED',
    resourceType: 'reel',
    resourceId: reelId,
    metadata: { ownerId: reel.authorId },
    ...meta,
  });

  return { message: 'Reel restored.', id: reelId };
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

export async function toggleSaveReel(userId: string, reelId: string) {
  const reel = await prisma.reel.findFirst({ where: { id: reelId, isDeleted: false } });
  if (!reel) throw new AppError(404, 'Reel not found');

  const existing = await prisma.savedReel.findUnique({
    where: { userId_reelId: { userId, reelId } },
  });
  if (existing) {
    await prisma.savedReel.delete({ where: { id: existing.id } });
    return { saved: false };
  }
  await prisma.savedReel.create({ data: { userId, reelId } });
  return { saved: true };
}

export async function listSavedReels(userId: string) {
  const rows = await prisma.savedReel.findMany({
    where: {
      userId,
      reel: { isDeleted: false, deletedAt: null, archivedAt: null },
    },
    orderBy: { createdAt: 'desc' },
    include: {
      reel: {
        include: {
          author: { select: authorSelect },
          likes: { where: { userId }, select: { id: true } },
          saves: { where: { userId }, select: { id: true } },
          _count: { select: { likes: true, comments: true, saves: true } },
        },
      },
    },
  });
  return rows.map((r) => mapReel(r.reel, userId));
}

export async function listUserReels(viewerId: string, authorId: string, departmentId: string) {
  const friendIds = await getFriendIds(viewerId);
  const reels = await prisma.reel.findMany({
    where: {
      authorId,
      isDeleted: false,
      deletedAt: null,
      archivedAt: null,
      ...visibilityFilter(viewerId, departmentId, friendIds),
    },
    include: {
      author: { select: authorSelect },
      likes: { where: { userId: viewerId }, select: { id: true } },
      saves: { where: { userId: viewerId }, select: { id: true } },
      _count: { select: { likes: true, comments: true, saves: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  return reels.map((r) => mapReel(r, viewerId));
}

// ── Comments ──────────────────────────────────────────────

export async function listReelComments(reelId: string, viewerId: string) {
  const comments = await prisma.reelComment.findMany({
    where: { reelId, isDeleted: false, parentId: null },
    orderBy: { createdAt: 'asc' },
    include: {
      user: {
        select: {
          id: true,
          regNo: true,
          profile: { select: { name: true, profilePhotoUrl: true } },
        },
      },
      likes: { where: { userId: viewerId }, select: { id: true } },
      _count: { select: { likes: true, replies: true } },
      replies: {
        where: { isDeleted: false },
        orderBy: { createdAt: 'asc' },
        take: 20,
        include: {
          user: {
            select: {
              id: true,
              regNo: true,
              profile: { select: { name: true, profilePhotoUrl: true } },
            },
          },
          likes: { where: { userId: viewerId }, select: { id: true } },
          _count: { select: { likes: true } },
        },
      },
    },
  });

  return comments.map((c) => mapComment(c, viewerId));
}

export async function addReelComment(
  userId: string,
  reelId: string,
  body: string,
  parentId?: string | null,
) {
  const reel = await prisma.reel.findFirst({ where: { id: reelId, isDeleted: false } });
  if (!reel) throw new AppError(404, 'Reel not found');
  const text = sanitizeText(body, 500);
  if (!text) throw new AppError(400, 'Comment is required');

  if (parentId) {
    const parent = await prisma.reelComment.findFirst({
      where: { id: parentId, reelId, isDeleted: false },
    });
    if (!parent) throw new AppError(404, 'Parent comment not found');
  }

  const comment = await prisma.reelComment.create({
    data: { reelId, userId, body: text, parentId: parentId || null },
    include: {
      user: {
        select: {
          id: true,
          regNo: true,
          profile: { select: { name: true, profilePhotoUrl: true } },
        },
      },
      likes: { where: { userId }, select: { id: true } },
      _count: { select: { likes: true, replies: true } },
    },
  });

  return mapComment({ ...comment, replies: [] }, userId);
}

export async function deleteReelComment(
  actor: { id: string; role: UserRole },
  commentId: string,
) {
  const comment = await prisma.reelComment.findFirst({ where: { id: commentId } });
  if (!comment || comment.isDeleted) throw new AppError(404, 'Comment not found');
  if (comment.userId !== actor.id && actor.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'Not allowed');
  }
  await prisma.reelComment.update({
    where: { id: commentId },
    data: { isDeleted: true, body: '' },
  });
  return { message: 'Comment deleted' };
}

export async function toggleCommentLike(userId: string, commentId: string) {
  const comment = await prisma.reelComment.findFirst({
    where: { id: commentId, isDeleted: false },
  });
  if (!comment) throw new AppError(404, 'Comment not found');

  const existing = await prisma.reelCommentLike.findUnique({
    where: { commentId_userId: { commentId, userId } },
  });
  if (existing) {
    await prisma.reelCommentLike.delete({ where: { id: existing.id } });
    return {
      liked: false,
      likeCount: await prisma.reelCommentLike.count({ where: { commentId } }),
    };
  }
  await prisma.reelCommentLike.create({ data: { commentId, userId } });
  return {
    liked: true,
    likeCount: await prisma.reelCommentLike.count({ where: { commentId } }),
  };
}

export async function reportComment(reporterId: string, commentId: string, reason: string) {
  const comment = await prisma.reelComment.findFirst({ where: { id: commentId } });
  if (!comment) throw new AppError(404, 'Comment not found');
  const report = await prisma.contentReport.create({
    data: {
      reporterId,
      targetType: 'COMMENT',
      targetId: commentId,
      targetUserId: comment.userId,
      reason: 'OTHER',
      details: `REEL_COMMENT: ${reason}`,
    },
  });
  return { message: 'Report submitted', id: report.id };
}

// ── Super Admin ───────────────────────────────────────────

export async function adminListReels(params?: {
  search?: string;
  includeDeleted?: boolean;
}) {
  const search = params?.search?.trim();
  const reels = await prisma.reel.findMany({
    where: {
      ...(params?.includeDeleted ? {} : { isDeleted: false }),
      ...(search
        ? {
            OR: [
              { caption: { contains: search, mode: 'insensitive' } },
              { author: { regNo: { contains: search, mode: 'insensitive' } } },
              {
                author: {
                  profile: { name: { contains: search, mode: 'insensitive' } },
                },
              },
            ],
          }
        : {}),
    },
    include: {
      author: { select: authorSelect },
      _count: { select: { likes: true, comments: true, saves: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return reels.map((r) => ({
    id: r.id,
    caption: r.caption,
    hashtags: r.hashtags,
    mediaUrl: r.mediaUrl,
    mediaMimeType: r.mediaMimeType,
    coverUrl: r.coverUrl,
    visibility: r.visibility,
    durationSec: r.durationSec,
    viewCount: r.viewCount,
    likeCount: r._count.likes,
    commentCount: r._count.comments,
    saveCount: r._count.saves,
    isDeleted: r.isDeleted,
    deletedAt: r.deletedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    author: {
      id: r.author.id,
      regNo: r.author.regNo,
      name: r.author.profile?.name ?? r.author.regNo,
      department: r.author.department.name,
      profilePhotoUrl: r.author.profile?.profilePhotoUrl ?? null,
    },
  }));
}

// ── Mappers ───────────────────────────────────────────────

function mapComment(
  c: {
    id: string;
    reelId: string;
    userId: string;
    body: string;
    parentId: string | null;
    createdAt: Date;
    user: {
      id: string;
      regNo: string;
      profile: { name: string; profilePhotoUrl: string | null } | null;
    };
    likes: Array<{ id: string }>;
    _count: { likes: number; replies?: number };
    replies?: Array<{
      id: string;
      reelId: string;
      userId: string;
      body: string;
      parentId: string | null;
      createdAt: Date;
      user: {
        id: string;
        regNo: string;
        profile: { name: string; profilePhotoUrl: string | null } | null;
      };
      likes: Array<{ id: string }>;
      _count: { likes: number };
    }>;
  },
  viewerId: string,
) {
  return {
    id: c.id,
    reelId: c.reelId,
    body: c.body,
    parentId: c.parentId,
    createdAt: c.createdAt.toISOString(),
    likeCount: c._count.likes,
    likedByMe: c.likes.length > 0,
    replyCount: c._count.replies ?? 0,
    isMine: c.userId === viewerId,
    author: {
      id: c.user.id,
      regNo: c.user.regNo,
      name: c.user.profile?.name ?? c.user.regNo,
      profilePhotoUrl: c.user.profile?.profilePhotoUrl ?? null,
    },
    replies: (c.replies ?? []).map((r) => ({
      id: r.id,
      reelId: r.reelId,
      body: r.body,
      parentId: r.parentId,
      createdAt: r.createdAt.toISOString(),
      likeCount: r._count.likes,
      likedByMe: r.likes.length > 0,
      isMine: r.userId === viewerId,
      author: {
        id: r.user.id,
        regNo: r.user.regNo,
        name: r.user.profile?.name ?? r.user.regNo,
        profilePhotoUrl: r.user.profile?.profilePhotoUrl ?? null,
      },
    })),
  };
}

function mapReel(
  reel: {
    id: string;
    authorId: string;
    caption: string | null;
    hashtags?: string[];
    mediaUrl: string;
    mediaMimeType?: string | null;
    coverUrl: string | null;
    audioName?: string | null;
    durationSec?: number | null;
    viewCount?: number;
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
    saves?: Array<{ id: string }>;
    _count: { likes: number; comments?: number; saves?: number };
  },
  viewerId: string,
) {
  return {
    id: reel.id,
    ownerId: reel.authorId,
    userId: reel.authorId,
    caption: reel.caption,
    hashtags: reel.hashtags ?? [],
    mediaUrl: reel.mediaUrl,
    videoUrl: reel.mediaUrl,
    mediaMimeType: reel.mediaMimeType ?? null,
    coverUrl: reel.coverUrl,
    thumbnailUrl: reel.coverUrl,
    audioName: reel.audioName ?? 'Original audio',
    durationSec: reel.durationSec ?? null,
    viewCount: reel.viewCount ?? 0,
    visibility: reel.visibility,
    createdAt: reel.createdAt.toISOString(),
    likeCount: reel._count.likes,
    commentCount: reel._count.comments ?? 0,
    saveCount: reel._count.saves ?? 0,
    likedByMe: reel.likes.length > 0,
    savedByMe: (reel.saves?.length ?? 0) > 0,
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
