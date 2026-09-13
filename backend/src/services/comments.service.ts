/**
 * Unified comment helpers for posts (new) and reels (existing).
 * Nested replies limited to 2 levels (root + one reply).
 */
import type { UserRole } from '@prisma/client';
import { sanitizeText } from '@avichian/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { createNotification } from './notification.service.js';
import { emitToUser, getIo } from '../socket.js';

const authorSelect = {
  id: true,
  regNo: true,
  profile: { select: { name: true, profilePhotoUrl: true, nickname: true } },
} as const;

function extractMentions(text: string): string[] {
  const found = text.match(/@([a-zA-Z0-9._-]{2,32})/g) ?? [];
  return [...new Set(found.map((m) => m.slice(1).toLowerCase()))];
}

async function resolveMentionUserIds(handles: string[]): Promise<string[]> {
  if (!handles.length) return [];
  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      role: 'STUDENT',
      OR: [
        { regNo: { in: handles.map((h) => h.toUpperCase()) } },
        { profile: { nickname: { in: handles, mode: 'insensitive' } } },
      ],
    },
    select: { id: true },
    take: 20,
  });
  return users.map((u) => u.id);
}

type MappedComment = {
  id: string;
  body: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  replyCount: number;
  likedByMe: boolean;
  isMine: boolean;
  author: {
    id: string;
    regNo: string;
    name: string;
    nickname: string | null;
    profilePhotoUrl: string | null;
  };
  replies: MappedComment[];
};

function mapPostComment(
  c: {
    id: string;
    body: string;
    parentId: string | null;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
    user: {
      id: string;
      regNo: string;
      profile: { name: string; profilePhotoUrl: string | null; nickname: string | null } | null;
    };
    likes: { id: string }[];
    _count: { likes: number; replies?: number };
    replies?: unknown[];
  },
  viewerId: string,
): MappedComment {
  return {
    id: c.id,
    body: c.body,
    parentId: c.parentId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    likeCount: c._count.likes,
    replyCount: c._count.replies ?? 0,
    likedByMe: c.likes.length > 0,
    isMine: c.userId === viewerId,
    author: {
      id: c.user.id,
      regNo: c.user.regNo,
      name: c.user.profile?.name ?? c.user.regNo,
      nickname: c.user.profile?.nickname ?? null,
      profilePhotoUrl: c.user.profile?.profilePhotoUrl ?? null,
    },
    replies: Array.isArray(c.replies)
      ? (c.replies as typeof c[]).map((r) => mapPostComment(r, viewerId))
      : [],
  };
}

export async function listPostComments(
  postId: string,
  viewerId: string,
  cursor?: string,
  limit = 30,
) {
  const take = Math.min(Math.max(limit, 1), 50);
  const comments = await prisma.postComment.findMany({
    where: {
      postId,
      isDeleted: false,
      isHidden: false,
      parentId: null,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    include: {
      user: { select: authorSelect },
      likes: { where: { userId: viewerId }, select: { id: true } },
      _count: { select: { likes: true, replies: true } },
      replies: {
        where: { isDeleted: false, isHidden: false },
        orderBy: { createdAt: 'asc' },
        take: 30,
        include: {
          user: { select: authorSelect },
          likes: { where: { userId: viewerId }, select: { id: true } },
          _count: { select: { likes: true } },
        },
      },
    },
  });

  const hasMore = comments.length > take;
  const items = hasMore ? comments.slice(0, take) : comments;
  return {
    items: items.map((c) => mapPostComment(c as never, viewerId)),
    nextCursor: hasMore ? items[items.length - 1]!.createdAt.toISOString() : null,
    commentCount: await prisma.post
      .findUnique({ where: { id: postId }, select: { commentCount: true } })
      .then((p) => p?.commentCount ?? 0),
  };
}

export async function addPostComment(
  userId: string,
  postId: string,
  body: string,
  parentId?: string | null,
) {
  const post = await prisma.post.findFirst({
    where: { id: postId, isDeleted: false, deletedAt: null },
  });
  if (!post) throw new AppError(404, 'Post not found');

  const text = sanitizeText(body, 500);
  if (!text) throw new AppError(400, 'Comment is required');

  let resolvedParentId: string | null = null;
  if (parentId) {
    const parent = await prisma.postComment.findFirst({
      where: { id: parentId, postId, isDeleted: false },
    });
    if (!parent) throw new AppError(404, 'Parent comment not found');
    // Max 2 levels: cannot reply to a reply
    if (parent.parentId) {
      throw new AppError(400, 'Replies are limited to one level deep');
    }
    resolvedParentId = parent.id;
  }

  const comment = await prisma.$transaction(async (tx) => {
    const created = await tx.postComment.create({
      data: {
        postId,
        userId,
        body: text,
        parentId: resolvedParentId,
      },
      include: {
        user: { select: authorSelect },
        likes: { where: { userId }, select: { id: true } },
        _count: { select: { likes: true, replies: true } },
      },
    });
    await tx.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
    });
    return created;
  });

  const mapped = mapPostComment({ ...comment, replies: [] } as never, userId);

  // Live update room for post
  getIo()?.to(`post:${postId}`).emit('comment:new', {
    targetType: 'POST',
    targetId: postId,
    comment: mapped,
  });

  // Notify post author
  if (post.authorId !== userId) {
    const name = comment.user.profile?.name ?? comment.user.regNo;
    await createNotification({
      userId: post.authorId,
      type: 'COMMENT',
      title: 'New comment',
      body: `${name} commented on your post`,
      data: { postId, commentId: comment.id, fromUserId: userId },
    });
  }

  // Notify parent comment author on reply
  if (resolvedParentId) {
    const parent = await prisma.postComment.findUnique({ where: { id: resolvedParentId } });
    if (parent && parent.userId !== userId && parent.userId !== post.authorId) {
      const name = comment.user.profile?.name ?? comment.user.regNo;
      await createNotification({
        userId: parent.userId,
        type: 'COMMENT',
        title: 'New reply',
        body: `${name} replied to your comment`,
        data: { postId, commentId: comment.id, parentId: resolvedParentId, fromUserId: userId },
      });
    }
  }

  // Mentions
  const mentionIds = await resolveMentionUserIds(extractMentions(text));
  for (const mid of mentionIds) {
    if (mid === userId) continue;
    const name = comment.user.profile?.name ?? comment.user.regNo;
    await createNotification({
      userId: mid,
      type: 'COMMENT',
      title: 'You were mentioned',
      body: `${name} mentioned you in a comment`,
      data: { postId, commentId: comment.id, fromUserId: userId },
    });
  }

  const count = (
    await prisma.post.findUnique({ where: { id: postId }, select: { commentCount: true } })
  )?.commentCount;
  getIo()?.to(`post:${postId}`).emit('comment:count', { targetType: 'POST', targetId: postId, count });

  return mapped;
}

export async function editPostComment(userId: string, commentId: string, body: string) {
  const comment = await prisma.postComment.findFirst({
    where: { id: commentId, isDeleted: false },
  });
  if (!comment) throw new AppError(404, 'Comment not found');
  if (comment.userId !== userId) throw new AppError(403, 'Not allowed');
  const text = sanitizeText(body, 500);
  if (!text) throw new AppError(400, 'Comment is required');

  const updated = await prisma.postComment.update({
    where: { id: commentId },
    data: { body: text },
    include: {
      user: { select: authorSelect },
      likes: { where: { userId }, select: { id: true } },
      _count: { select: { likes: true, replies: true } },
    },
  });
  const mapped = mapPostComment({ ...updated, replies: [] } as never, userId);
  getIo()?.to(`post:${comment.postId}`).emit('comment:updated', {
    targetType: 'POST',
    targetId: comment.postId,
    comment: mapped,
  });
  return mapped;
}

export async function deletePostComment(
  actor: { id: string; role: UserRole },
  commentId: string,
) {
  const comment = await prisma.postComment.findFirst({ where: { id: commentId } });
  if (!comment || comment.isDeleted) throw new AppError(404, 'Comment not found');
  if (comment.userId !== actor.id && actor.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'Not allowed');
  }

  await prisma.$transaction(async (tx) => {
    await tx.postComment.update({
      where: { id: commentId },
      data: { isDeleted: true, body: '' },
    });
    // Soft-delete replies
    await tx.postComment.updateMany({
      where: { parentId: commentId, isDeleted: false },
      data: { isDeleted: true, body: '' },
    });
    const remaining = await tx.postComment.count({
      where: { postId: comment.postId, isDeleted: false },
    });
    await tx.post.update({
      where: { id: comment.postId },
      data: { commentCount: remaining },
    });
  });

  getIo()?.to(`post:${comment.postId}`).emit('comment:deleted', {
    targetType: 'POST',
    targetId: comment.postId,
    commentId,
  });
  const count = (
    await prisma.post.findUnique({ where: { id: comment.postId }, select: { commentCount: true } })
  )?.commentCount;
  getIo()?.to(`post:${comment.postId}`).emit('comment:count', {
    targetType: 'POST',
    targetId: comment.postId,
    count,
  });

  return { message: 'Comment deleted' };
}

export async function togglePostCommentLike(userId: string, commentId: string) {
  const comment = await prisma.postComment.findFirst({
    where: { id: commentId, isDeleted: false },
  });
  if (!comment) throw new AppError(404, 'Comment not found');

  const existing = await prisma.postCommentLike.findUnique({
    where: { commentId_userId: { commentId, userId } },
  });
  if (existing) {
    await prisma.postCommentLike.delete({ where: { id: existing.id } });
  } else {
    await prisma.postCommentLike.create({ data: { commentId, userId } });
  }
  const likeCount = await prisma.postCommentLike.count({ where: { commentId } });
  const liked = !existing;
  getIo()?.to(`post:${comment.postId}`).emit('comment:like', {
    targetType: 'POST',
    commentId,
    likeCount,
    likedBy: userId,
    liked,
  });
  return { liked, likeCount };
}

export async function hidePostComment(adminId: string, commentId: string) {
  const comment = await prisma.postComment.findFirst({ where: { id: commentId } });
  if (!comment) throw new AppError(404, 'Comment not found');
  await prisma.postComment.update({
    where: { id: commentId },
    data: { isHidden: true },
  });
  getIo()?.to(`post:${comment.postId}`).emit('comment:deleted', {
    targetType: 'POST',
    targetId: comment.postId,
    commentId,
    hidden: true,
  });
  return { message: 'Comment hidden', id: commentId, by: adminId };
}

/** Enhance reel comments: depth limit, notify, socket */
export async function notifyReelCommentSideEffects(params: {
  userId: string;
  reelId: string;
  commentId: string;
  body: string;
  parentId?: string | null;
  authorName: string;
  reelAuthorId: string;
  mapped: unknown;
}) {
  getIo()?.to(`reel:${params.reelId}`).emit('comment:new', {
    targetType: 'REEL',
    targetId: params.reelId,
    comment: params.mapped,
  });

  if (params.reelAuthorId !== params.userId) {
    await createNotification({
      userId: params.reelAuthorId,
      type: 'COMMENT',
      title: 'New comment',
      body: `${params.authorName} commented on your reel`,
      data: { reelId: params.reelId, commentId: params.commentId, fromUserId: params.userId },
    });
  }

  if (params.parentId) {
    const parent = await prisma.reelComment.findUnique({ where: { id: params.parentId } });
    if (parent && parent.userId !== params.userId && parent.userId !== params.reelAuthorId) {
      await createNotification({
        userId: parent.userId,
        type: 'COMMENT',
        title: 'New reply',
        body: `${params.authorName} replied to your comment`,
        data: {
          reelId: params.reelId,
          commentId: params.commentId,
          parentId: params.parentId,
          fromUserId: params.userId,
        },
      });
    }
  }

  const mentionIds = await resolveMentionUserIds(extractMentions(params.body));
  for (const mid of mentionIds) {
    if (mid === params.userId) continue;
    await createNotification({
      userId: mid,
      type: 'COMMENT',
      title: 'You were mentioned',
      body: `${params.authorName} mentioned you in a comment`,
      data: { reelId: params.reelId, commentId: params.commentId, fromUserId: params.userId },
    });
  }
}

// silence unused import lint if emitToUser not used elsewhere
void emitToUser;
