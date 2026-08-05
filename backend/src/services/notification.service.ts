import type { NotificationType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { emitToUser } from '../socket.js';

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}) {
  const row = await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data,
    },
  });

  const payload = {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    isRead: Boolean(row.readAt),
  };

  emitToUser(params.userId, 'notification', payload);
  emitToUser(params.userId, 'notification:new', payload);

  return row;
}

export async function listNotifications(userId: string) {
  const items = await prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 80,
  });
  const unread = await prisma.notification.count({
    where: { userId, readAt: null },
  });
  return {
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      createdAt: n.createdAt.toISOString(),
      readAt: n.readAt?.toISOString() ?? null,
      isRead: Boolean(n.readAt),
    })),
    unread,
  };
}

export async function markNotificationsRead(userId: string, ids?: string[]) {
  await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(ids?.length ? { id: { in: ids } } : {}),
    },
    data: { readAt: new Date() },
  });
  emitToUser(userId, 'notification:read', { ids: ids ?? null });
  return { ok: true };
}

export async function deleteNotification(userId: string, notificationId: string) {
  const existing = await prisma.notification.findFirst({
    where: { id: notificationId, userId },
  });
  if (!existing) return { ok: true };
  await prisma.notification.delete({ where: { id: notificationId } });
  emitToUser(userId, 'notification:deleted', { id: notificationId });
  return { ok: true };
}

/** Remove friend-request notifications tied to a request id (accept/reject). */
export async function deleteFriendRequestNotifications(receiverId: string, requestId: string) {
  const rows = await prisma.notification.findMany({
    where: {
      userId: receiverId,
      type: 'FRIEND_REQUEST',
    },
    select: { id: true, data: true },
  });
  const ids = rows
    .filter((r) => {
      const d = r.data as { requestId?: string } | null;
      return d?.requestId === requestId;
    })
    .map((r) => r.id);
  if (!ids.length) return;
  await prisma.notification.deleteMany({ where: { id: { in: ids } } });
  for (const id of ids) {
    emitToUser(receiverId, 'notification:deleted', { id });
  }
}
