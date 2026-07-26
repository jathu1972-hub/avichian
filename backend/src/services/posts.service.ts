import type { PostVisibility, UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { sanitizeText } from '@avichian/shared';
import { AppError } from '../utils/errors.js';
import { getFriendIds } from './friends.service.js';
import { writeAuditLog } from './audit.service.js';
import { assertCanModerate, restoreFields, softDeleteFields } from './content-ownership.service.js';

const authorSelect = {
  id: true,
  regNo: true,
  departmentId: true,
  profile: {
    select: { name: true, profilePhotoUrl: true, year: true },
  },
  department: { select: { name: true } },
} as const;

async function hiddenPostIds(userId: string) {
  const rows = await prisma.contentHide.findMany({
    where: { userId, targetType: 'POST' },
    select: { targetId: true },
  });
  return rows.map((r) => r.targetId);
}

export async function createPost(
  authorId: string,
  data: { caption?: string; mediaUrl?: string; visibility?: PostVisibility },
) {
  const post = await prisma.post.create({
    data: {
      authorId,
      caption: data.caption ? sanitizeText(data.caption, 2000) : null,
      mediaUrl: data.mediaUrl ?? null,
      visibility: data.visibility ?? 'DEPARTMENT',
    },
    include: {
      author: { select: authorSelect },
      likes: { where: { userId: authorId }, select: { id: true } },
      _count: { select: { likes: true } },
    },
  });

  return mapPost(post, authorId);
}

export async function getFeed(userId: string, departmentId: string, cursor?: string, limit = 20) {
  const friendIds = await getFriendIds(userId);
  const hidden = await hiddenPostIds(userId);

  const posts = await prisma.post.findMany({
    where: {
      isDeleted: false,
      deletedAt: null,
      archivedAt: null,
      ...(hidden.length ? { id: { notIn: hidden } } : {}),
      OR: [
        { authorId: userId },
        { visibility: 'PUBLIC' },
        { visibility: 'DEPARTMENT', author: { departmentId } },
        { visibility: 'FRIENDS', authorId: { in: friendIds } },
      ],
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    include: {
      author: { select: authorSelect },
      likes: { where: { userId }, select: { id: true } },
      _count: { select: { likes: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });

  const hasMore = posts.length > limit;
  const items = hasMore ? posts.slice(0, limit) : posts;

  return {
    posts: items.map((post) => mapPost(post, userId)),
    nextCursor: hasMore ? items[items.length - 1]!.createdAt.toISOString() : null,
  };
}

export async function togglePostLike(userId: string, postId: string) {
  const post = await prisma.post.findFirst({
    where: { id: postId, isDeleted: false, deletedAt: null },
  });
  if (!post) {
    throw new AppError(404, 'Post not found');
  }

  const existing = await prisma.postLike.findUnique({
    where: { postId_userId: { postId, userId } },
  });

  if (existing) {
    await prisma.postLike.delete({ where: { id: existing.id } });
    const count = await prisma.postLike.count({ where: { postId } });
    return { liked: false, likeCount: count };
  }

  await prisma.postLike.create({ data: { postId, userId } });
  const count = await prisma.postLike.count({ where: { postId } });

  if (post.authorId !== userId) {
    const { createNotification } = await import('./notification.service.js');
    const liker = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    await createNotification({
      userId: post.authorId,
      type: 'POST_LIKE',
      title: 'New like',
      body: `${liker?.profile?.name ?? 'Someone'} liked your post`,
      data: { postId, userId },
    });
  }

  return { liked: true, likeCount: count };
}

export async function getUserPosts(viewerId: string, authorId: string, departmentId: string) {
  const friendIds = await getFriendIds(viewerId);
  const isSelf = viewerId === authorId;
  const isFriend = friendIds.includes(authorId);
  const hidden = await hiddenPostIds(viewerId);

  const author = await prisma.user.findFirst({
    where: { id: authorId, role: { in: ['STUDENT', 'STAFF'] }, deletedAt: null },
    select: { departmentId: true },
  });
  if (!author) {
    throw new AppError(404, 'Student not found');
  }

  const visibilityFilter = isSelf
    ? {}
    : {
        OR: [
          { visibility: 'PUBLIC' as const },
          ...(author.departmentId === departmentId ? [{ visibility: 'DEPARTMENT' as const }] : []),
          ...(isFriend ? [{ visibility: 'FRIENDS' as const }] : []),
        ],
      };

  const posts = await prisma.post.findMany({
    where: {
      authorId,
      isDeleted: false,
      deletedAt: null,
      ...(isSelf ? {} : { archivedAt: null }),
      ...(hidden.length ? { id: { notIn: hidden } } : {}),
      ...visibilityFilter,
    },
    include: {
      author: { select: authorSelect },
      likes: { where: { userId: viewerId }, select: { id: true } },
      _count: { select: { likes: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return posts.map((post) => mapPost(post, viewerId));
}

export async function updatePost(
  actor: { id: string; role: UserRole },
  postId: string,
  data: { caption?: string; visibility?: PostVisibility },
  meta: { ipAddress?: string; userAgent?: string },
) {
  const post = await prisma.post.findFirst({
    where: { id: postId, isDeleted: false },
  });
  if (!post) throw new AppError(404, 'Post not found');
  assertCanModerate(actor, post.authorId);

  const updated = await prisma.post.update({
    where: { id: postId },
    data: {
      ...(data.caption !== undefined
        ? { caption: data.caption ? sanitizeText(data.caption, 2000) : null }
        : {}),
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
    resourceType: 'post',
    resourceId: postId,
    metadata: { fields: Object.keys(data), ownerId: post.authorId },
    ...meta,
  });

  return mapPost(updated, actor.id);
}

export async function deletePostOwned(
  actor: { id: string; role: UserRole },
  postId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const post = await prisma.post.findFirst({ where: { id: postId, isDeleted: false } });
  if (!post) throw new AppError(404, 'Post not found');
  assertCanModerate(actor, post.authorId);

  await prisma.post.update({
    where: { id: postId },
    data: softDeleteFields(actor.id),
  });

  await writeAuditLog({
    userId: actor.id,
    action: 'CONTENT_DELETED',
    resourceType: 'post',
    resourceId: postId,
    metadata: {
      ownerId: post.authorId,
      byOwner: actor.id === post.authorId,
      soft: true,
    },
    ...meta,
  });

  return { message: 'Post deleted successfully.', id: postId };
}

export async function archivePost(
  actor: { id: string; role: UserRole },
  postId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const post = await prisma.post.findFirst({
    where: { id: postId, isDeleted: false },
  });
  if (!post) throw new AppError(404, 'Post not found');
  assertCanModerate(actor, post.authorId);

  await prisma.post.update({
    where: { id: postId },
    data: { archivedAt: new Date() },
  });

  await writeAuditLog({
    userId: actor.id,
    action: 'CONTENT_ARCHIVED',
    resourceType: 'post',
    resourceId: postId,
    metadata: { ownerId: post.authorId },
    ...meta,
  });

  return { message: 'Post archived.', id: postId };
}

export async function restorePostOwned(
  actor: { id: string; role: UserRole },
  postId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  if (actor.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'Forbidden');
  }
  const post = await prisma.post.findUnique({ where: { id: postId } });
  if (!post) throw new AppError(404, 'Post not found');

  await prisma.post.update({
    where: { id: postId },
    data: { ...restoreFields(), archivedAt: null },
  });

  await writeAuditLog({
    userId: actor.id,
    action: 'CONTENT_RESTORED',
    resourceType: 'post',
    resourceId: postId,
    metadata: { ownerId: post.authorId },
    ...meta,
  });

  return { message: 'Post restored.', id: postId };
}

export async function hidePost(userId: string, postId: string) {
  await prisma.contentHide.upsert({
    where: {
      userId_targetType_targetId: { userId, targetType: 'POST', targetId: postId },
    },
    create: { userId, targetType: 'POST', targetId: postId },
    update: {},
  });
  return { message: 'Post hidden from your feed.' };
}

export async function reportPost(
  reporterId: string,
  postId: string,
  reason: string,
  details?: string,
) {
  const post = await prisma.post.findFirst({
    where: { id: postId, isDeleted: false },
  });
  if (!post) throw new AppError(404, 'Post not found');

  const valid = new Set([
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
  const reportReason = valid.has(reason) ? reason : 'OTHER';

  const report = await prisma.contentReport.create({
    data: {
      reporterId,
      targetType: 'POST',
      targetId: postId,
      targetUserId: post.authorId,
      reason: reportReason as 'OTHER',
      details,
    },
  });

  await writeAuditLog({
    userId: reporterId,
    action: 'CONTENT_REPORTED',
    resourceType: 'post',
    resourceId: postId,
    metadata: { reportId: report.id, reason },
  });

  return { message: 'Report submitted.', id: report.id };
}

type PostWithRelations = {
  id: string;
  authorId: string;
  caption: string | null;
  mediaUrl: string | null;
  visibility: PostVisibility;
  createdAt: Date;
  archivedAt?: Date | null;
  author: {
    id: string;
    regNo: string;
    departmentId: string;
    profile: { name: string; profilePhotoUrl: string | null; year: number | null } | null;
    department: { name: string };
  };
  likes: Array<{ id: string }>;
  _count: { likes: number };
};

function mapPost(post: PostWithRelations, viewerId: string) {
  return {
    id: post.id,
    ownerId: post.authorId,
    caption: post.caption,
    mediaUrl: post.mediaUrl,
    visibility: post.visibility,
    createdAt: post.createdAt.toISOString(),
    archived: Boolean(post.archivedAt),
    likeCount: post._count.likes,
    likedByMe: post.likes.length > 0,
    isMine: post.authorId === viewerId,
    author: {
      id: post.author.id,
      regNo: post.author.regNo,
      name: post.author.profile?.name ?? post.author.regNo,
      department: post.author.department.name,
      year: post.author.profile?.year ?? null,
      profilePhotoUrl: post.author.profile?.profilePhotoUrl ?? null,
    },
  };
}
