import type { StoryMediaType, StoryVisibility, UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { sanitizeText } from '@avichian/shared';
import { getFriendIds } from './friends.service.js';
import { AppError } from '../utils/errors.js';
import {
  storeUpload,
  type UploadPurpose,
} from './storage.service.js';
import { writeAuditLog } from './audit.service.js';
import { assertCanModerate, softDeleteFields } from './content-ownership.service.js';

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

export function inferStoryMediaType(
  mediaUrl: string,
  explicit?: string | null,
  mimeHint?: string | null,
): StoryMediaType {
  const t = (explicit || '').toUpperCase();
  if (t === 'VIDEO' || t === 'IMAGE') return t;

  const mime = (mimeHint || '').toLowerCase();
  if (mime.startsWith('video/')) return 'VIDEO';
  if (mime.startsWith('image/')) return 'IMAGE';

  const url = mediaUrl.toLowerCase();
  if (
    url.includes('story-video') ||
    url.includes('post-video') ||
    /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url)
  ) {
    return 'VIDEO';
  }
  return 'IMAGE';
}

function parseVisibility(value?: string | null): StoryVisibility {
  const v = (value || 'DEPARTMENT').toUpperCase();
  if (v === 'PUBLIC' || v === 'FRIENDS' || v === 'DEPARTMENT' || v === 'PRIVATE') {
    return v;
  }
  return 'DEPARTMENT';
}

function mapStoryItem(story: {
  id: string;
  mediaUrl: string;
  mediaType: StoryMediaType;
  caption: string | null;
  visibility: StoryVisibility;
  createdAt: Date;
  expiresAt: Date;
}) {
  return {
    id: story.id,
    mediaUrl: story.mediaUrl,
    mediaType: story.mediaType,
    caption: story.caption,
    visibility: story.visibility,
    createdAt: story.createdAt.toISOString(),
    expiresAt: story.expiresAt.toISOString(),
  };
}

function toPublicStory(story: {
  id: string;
  userId: string;
  mediaUrl: string;
  mediaType: StoryMediaType;
  caption: string | null;
  visibility: StoryVisibility;
  createdAt: Date;
  expiresAt: Date;
  user: {
    id: string;
    regNo: string;
    profile: { name: string; profilePhotoUrl: string | null } | null;
  };
}) {
  return {
    id: story.id,
    userId: story.userId,
    mediaUrl: story.mediaUrl,
    mediaType: story.mediaType,
    caption: story.caption,
    visibility: story.visibility,
    createdAt: story.createdAt.toISOString(),
    expiresAt: story.expiresAt.toISOString(),
    user: {
      id: story.user.id,
      regNo: story.user.regNo,
      name: story.user.profile?.name ?? story.user.regNo,
      profilePhoto: story.user.profile?.profilePhotoUrl ?? null,
      profilePhotoUrl: story.user.profile?.profilePhotoUrl ?? null,
    },
    author: {
      id: story.user.id,
      regNo: story.user.regNo,
      name: story.user.profile?.name ?? story.user.regNo,
      profilePhotoUrl: story.user.profile?.profilePhotoUrl ?? null,
    },
  };
}

export async function createStory(
  userId: string,
  data: {
    mediaUrl: string;
    caption?: string;
    mediaType?: string;
    mimeType?: string;
    visibility?: string;
  },
) {
  if (!data.mediaUrl?.trim()) {
    throw new AppError(400, 'mediaUrl is required');
  }

  const mediaType = inferStoryMediaType(data.mediaUrl, data.mediaType, data.mimeType);
  const visibility = parseVisibility(data.visibility);
  const expiresAt = new Date(Date.now() + STORY_TTL_MS);

  console.info('[story] inserting PostgreSQL record', {
    userId,
    mediaType,
    visibility,
    mediaUrl: data.mediaUrl.slice(0, 80),
    expiresAt: expiresAt.toISOString(),
  });

  try {
    const story = await prisma.story.create({
      data: {
        userId,
        mediaUrl: data.mediaUrl.trim(),
        mediaType,
        visibility,
        caption: data.caption ? sanitizeText(data.caption, 200) : null,
        expiresAt,
      },
      include: {
        user: {
          select: {
            id: true,
            regNo: true,
            profile: { select: { name: true, profilePhotoUrl: true } },
          },
        },
      },
    });

    console.info('[story] inserted', { id: story.id, userId: story.userId, mediaType: story.mediaType });
    return toPublicStory(story);
  } catch (err) {
    console.error('[story] PostgreSQL insert FAILED', err);
    throw new AppError(
      500,
      err instanceof Error ? `Failed to save story: ${err.message}` : 'Failed to save story',
      'STORY_INSERT_FAILED',
    );
  }
}

/**
 * Atomic path: store file + create Story row in one operation.
 * Prefer this over separate /uploads then /stories so orphans cannot happen.
 */
export async function createStoryWithFile(
  userId: string,
  file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  options: { caption?: string; visibility?: string } = {},
) {
  console.info('[story] multipart upload received', {
    userId,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
  });

  const mime = (file.mimetype || '').toLowerCase();
  const isVideo = mime.startsWith('video/');
  const purpose: UploadPurpose = isVideo ? 'story_video' : 'story_image';

  const stored = await storeUpload({
    purpose,
    buffer: file.buffer,
    mimeType: file.mimetype,
    originalName: file.originalname,
    userId,
  });

  console.info('[story] file stored', {
    url: stored.url,
    key: stored.key,
    storage: stored.storage,
    mimeType: stored.mimeType,
  });

  const story = await createStory(userId, {
    mediaUrl: stored.url,
    caption: options.caption,
    mediaType: isVideo ? 'VIDEO' : 'IMAGE',
    mimeType: stored.mimeType,
    visibility: options.visibility,
  });

  return {
    ...story,
    storage: {
      id: stored.id,
      key: stored.key,
      fileName: stored.fileName,
      fileSize: stored.size,
      storage: stored.storage,
    },
  };
}

export async function getActiveStories(userId: string, departmentId: string) {
  const now = new Date();
  const friendIds = await getFriendIds(userId);

  console.info('[story] GET list', {
    userId,
    departmentId,
    friendCount: friendIds.length,
    now: now.toISOString(),
  });

  const hidden = await prisma.contentHide.findMany({
    where: { userId, targetType: 'STORY' },
    select: { targetId: true },
  });
  const hiddenIds = hidden.map((h) => h.targetId);

  // Load non-expired, non-deleted stories; own PRIVATE always included for author
  const stories = await prisma.story.findMany({
    where: {
      expiresAt: { gt: now },
      isDeleted: false,
      deletedAt: null,
      ...(hiddenIds.length ? { id: { notIn: hiddenIds } } : {}),
      user: {
        deletedAt: null,
        role: { in: ['STUDENT', 'STAFF'] },
      },
      OR: [
        { userId }, // always own (any visibility)
        {
          userId: { in: friendIds.length ? friendIds : ['__none__'] },
          visibility: { in: ['PUBLIC', 'FRIENDS', 'DEPARTMENT'] },
        },
        {
          visibility: { in: ['PUBLIC', 'DEPARTMENT'] },
          user: { departmentId, deletedAt: null },
        },
        {
          visibility: 'PUBLIC',
        },
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          regNo: true,
          departmentId: true,
          profile: { select: { name: true, profilePhotoUrl: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  console.info('[story] raw rows from PostgreSQL', {
    count: stories.length,
    ids: stories.map((s) => s.id),
    userIds: [...new Set(stories.map((s) => s.userId))],
  });

  const grouped = new Map<
    string,
    {
      user: {
        id: string;
        regNo: string;
        name: string;
        department: string;
        year: number | null;
        profilePhotoUrl: string | null;
        profilePhoto: string | null;
        isMe: boolean;
      };
      stories: ReturnType<typeof mapStoryItem>[];
      latestAt: string;
    }
  >();

  for (const story of stories) {
    const uid = story.userId;
    const item = mapStoryItem(story);
    const existing = grouped.get(uid);

    if (existing) {
      existing.stories.push(item);
      if (item.createdAt > existing.latestAt) existing.latestAt = item.createdAt;
    } else {
      const photo = story.user.profile?.profilePhotoUrl ?? null;
      grouped.set(uid, {
        user: {
          id: story.user.id,
          regNo: story.user.regNo,
          name: story.user.profile?.name ?? story.user.regNo,
          department: '',
          year: null,
          profilePhotoUrl: photo,
          profilePhoto: photo,
          isMe: uid === userId,
        },
        stories: [item],
        latestAt: item.createdAt,
      });
    }
  }

  for (const g of grouped.values()) {
    g.stories.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const groups = Array.from(grouped.values()).sort((a, b) => {
    if (a.user.isMe) return -1;
    if (b.user.isMe) return 1;
    return b.latestAt.localeCompare(a.latestAt);
  });

  console.info('[story] returning groups', {
    groupCount: groups.length,
    totalStories: groups.reduce((n, g) => n + g.stories.length, 0),
    hasMine: groups.some((g) => g.user.isMe),
  });

  return groups;
}

export async function cleanupExpiredStories() {
  await prisma.story.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}

export async function deleteStoryOwned(
  actor: { id: string; role: UserRole },
  storyId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const story = await prisma.story.findFirst({
    where: { id: storyId, isDeleted: false },
  });
  if (!story) throw new AppError(404, 'Story not found');
  assertCanModerate(actor, story.userId);

  await prisma.story.update({
    where: { id: storyId },
    data: softDeleteFields(actor.id),
  });

  await writeAuditLog({
    userId: actor.id,
    action: 'CONTENT_DELETED',
    resourceType: 'story',
    resourceId: storyId,
    metadata: {
      ownerId: story.userId,
      byOwner: actor.id === story.userId,
      soft: true,
    },
    ...meta,
  });

  return { message: 'Story deleted successfully.', id: storyId };
}

export async function hideStory(userId: string, storyId: string) {
  await prisma.contentHide.upsert({
    where: {
      userId_targetType_targetId: { userId, targetType: 'STORY', targetId: storyId },
    },
    create: { userId, targetType: 'STORY', targetId: storyId },
    update: {},
  });
  return { message: 'Story hidden.' };
}

export async function muteUserStories(viewerId: string, targetUserId: string) {
  // Hide all active stories from this user for the viewer
  const stories = await prisma.story.findMany({
    where: {
      userId: targetUserId,
      isDeleted: false,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  for (const s of stories) {
    await prisma.contentHide.upsert({
      where: {
        userId_targetType_targetId: {
          userId: viewerId,
          targetType: 'STORY',
          targetId: s.id,
        },
      },
      create: { userId: viewerId, targetType: 'STORY', targetId: s.id },
      update: {},
    });
  }
  return { message: 'Stories muted.', count: stories.length };
}

export async function reportStory(
  reporterId: string,
  storyId: string,
  reason: string,
  details?: string,
) {
  const story = await prisma.story.findFirst({
    where: { id: storyId, isDeleted: false },
  });
  if (!story) throw new AppError(404, 'Story not found');

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
      targetType: 'STORY',
      targetId: storyId,
      targetUserId: story.userId,
      reason: reportReason as 'OTHER',
      details,
    },
  });

  await writeAuditLog({
    userId: reporterId,
    action: 'CONTENT_REPORTED',
    resourceType: 'story',
    resourceId: storyId,
    metadata: { reportId: report.id, reason: reportReason },
  });

  return { message: 'Report submitted.', id: report.id };
}
