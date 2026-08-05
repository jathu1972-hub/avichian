import { MessageType } from '@prisma/client';
import { sanitizeText } from '@avichian/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { areFriends, isBlockedEitherWay } from './friends.service.js';
import { createNotification } from './notification.service.js';

const userPreview = {
  id: true,
  regNo: true,
  online: true,
  lastSeen: true,
  profile: { select: { name: true, profilePhotoUrl: true, year: true } },
  department: { select: { name: true } },
} as const;

function mapUser(u: {
  id: string;
  regNo: string;
  online: boolean;
  lastSeen?: Date | null;
  profile: { name: string; profilePhotoUrl: string | null; year: number | null } | null;
  department: { name: string };
}) {
  return {
    id: u.id,
    regNo: u.regNo,
    name: u.profile?.name ?? u.regNo,
    department: u.department.name,
    year: u.profile?.year ?? null,
    profilePhotoUrl: u.profile?.profilePhotoUrl ?? null,
    online: u.online,
    lastSeen: u.lastSeen?.toISOString() ?? null,
  };
}

async function assertCanChat(userId: string, peerId: string) {
  if (userId === peerId) throw new AppError(400, 'Cannot chat with yourself');
  if (await isBlockedEitherWay(userId, peerId)) {
    throw new AppError(403, 'Cannot chat — user is blocked');
  }
  if (!(await areFriends(userId, peerId))) {
    throw new AppError(403, 'You can only chat with accepted friends');
  }
}

async function assertMember(userId: string, conversationId: string) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!member) throw new AppError(403, 'Not a member of this conversation');
  return member;
}

function mapReply(
  reply: {
    id: string;
    body: string | null;
    type: MessageType;
    senderId: string;
    mediaUrl: string | null;
    deletedAt: Date | null;
  } | null,
) {
  if (!reply) return null;
  return {
    id: reply.id,
    body: reply.deletedAt ? null : reply.body,
    type: reply.type,
    senderId: reply.senderId,
    mediaUrl: reply.deletedAt ? null : reply.mediaUrl,
    deleted: Boolean(reply.deletedAt),
  };
}

function mapMessage(
  m: {
    id: string;
    body: string | null;
    type: MessageType;
    mediaUrl: string | null;
    fileName: string | null;
    replyToId: string | null;
    deliveredAt: Date | null;
    seenAt: Date | null;
    editedAt: Date | null;
    deletedAt: Date | null;
    createdAt: Date;
    senderId: string;
    conversationId: string;
    sender: {
      id: string;
      regNo: string;
      online: boolean;
      lastSeen?: Date | null;
      profile: { name: string; profilePhotoUrl: string | null; year: number | null } | null;
      department: { name: string };
    };
    replyTo?: {
      id: string;
      body: string | null;
      type: MessageType;
      senderId: string;
      mediaUrl: string | null;
      deletedAt: Date | null;
    } | null;
  },
  viewerId: string,
) {
  const deleted = Boolean(m.deletedAt);
  return {
    id: m.id,
    conversationId: m.conversationId,
    body: deleted ? null : m.body,
    type: m.type,
    mediaUrl: deleted ? null : m.mediaUrl,
    fileName: deleted ? null : m.fileName,
    replyToId: m.replyToId,
    replyTo: mapReply(m.replyTo ?? null),
    senderId: m.senderId,
    sender: mapUser(m.sender),
    deliveredAt: m.deliveredAt?.toISOString() ?? null,
    seenAt: m.seenAt?.toISOString() ?? null,
    editedAt: m.editedAt?.toISOString() ?? null,
    deleted,
    createdAt: m.createdAt.toISOString(),
    isMine: m.senderId === viewerId,
  };
}

const messageInclude = {
  sender: { select: userPreview },
  replyTo: {
    select: {
      id: true,
      body: true,
      type: true,
      senderId: true,
      mediaUrl: true,
      deletedAt: true,
    },
  },
} as const;

export async function getOrCreateDirectConversation(userId: string, peerId: string) {
  await assertCanChat(userId, peerId);

  const existing = await prisma.conversation.findFirst({
    where: {
      AND: [
        { members: { some: { userId } } },
        { members: { some: { userId: peerId } } },
      ],
    },
    include: {
      members: { include: { user: { select: userPreview } } },
    },
  });

  if (existing && existing.members.length === 2) {
    return existing;
  }

  return prisma.conversation.create({
    data: {
      members: {
        create: [{ userId }, { userId: peerId }],
      },
    },
    include: {
      members: { include: { user: { select: userPreview } } },
    },
  });
}

export async function listConversations(userId: string) {
  const memberships = await prisma.conversationMember.findMany({
    where: { userId },
    include: {
      conversation: {
        include: {
          members: { include: { user: { select: userPreview } } },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      },
    },
    orderBy: { conversation: { updatedAt: 'desc' } },
  });

  const result = await Promise.all(
    memberships.map(async (m) => {
      const peer = m.conversation.members.find((x) => x.userId !== userId)?.user;
      const last = m.conversation.messages[0];
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: m.conversationId,
          senderId: { not: userId },
          deletedAt: null,
          seenAt: null,
        },
      });

      return {
        id: m.conversation.id,
        peer: peer ? mapUser(peer) : null,
        lastMessage: last
          ? {
              id: last.id,
              body: last.body,
              type: last.type,
              createdAt: last.createdAt.toISOString(),
              senderId: last.senderId,
            }
          : null,
        unreadCount,
        updatedAt: m.conversation.updatedAt.toISOString(),
      };
    }),
  );

  return result;
}

export async function listMessages(userId: string, conversationId: string, cursor?: string) {
  await assertMember(userId, conversationId);

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: messageInclude,
  });

  // Delivered: peer's messages that we just fetched
  await prisma.message.updateMany({
    where: {
      conversationId,
      senderId: { not: userId },
      deliveredAt: null,
      deletedAt: null,
    },
    data: { deliveredAt: new Date() },
  });

  return messages.reverse().map((m) => mapMessage(m, userId));
}

export async function sendMessage(
  userId: string,
  conversationId: string,
  data: {
    body?: string;
    type?: MessageType;
    mediaUrl?: string;
    fileName?: string;
    replyToId?: string | null;
  },
) {
  const member = await assertMember(userId, conversationId);

  const peers = await prisma.conversationMember.findMany({
    where: { conversationId, userId: { not: userId } },
  });
  for (const peer of peers) {
    if (await isBlockedEitherWay(userId, peer.userId)) {
      throw new AppError(403, 'Cannot chat — user is blocked');
    }
    if (!(await areFriends(userId, peer.userId))) {
      throw new AppError(403, 'You can only chat with accepted friends');
    }
  }

  const body = data.body?.trim() ? sanitizeText(data.body.trim(), 4000) : null;
  if (!body && !data.mediaUrl) {
    throw new AppError(400, 'Message body or media is required');
  }

  if (data.replyToId) {
    const parent = await prisma.message.findFirst({
      where: { id: data.replyToId, conversationId, deletedAt: null },
    });
    if (!parent) throw new AppError(404, 'Reply target not found');
  }

  let type: MessageType = data.type ?? 'TEXT';
  if (!data.type && data.mediaUrl) {
    const url = data.mediaUrl.toLowerCase();
    if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url) || url.includes('image')) type = 'IMAGE';
    else if (/\.(mp4|webm|mov)(\?|$)/i.test(url) || url.includes('video')) type = 'VIDEO';
    else if (/\.pdf(\?|$)/i.test(url)) type = 'PDF';
    else type = 'IMAGE';
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: userId,
      body,
      type,
      mediaUrl: data.mediaUrl ?? null,
      fileName: data.fileName ?? null,
      replyToId: data.replyToId || null,
      deliveredAt: null,
    },
    include: messageInclude,
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  // Keep sender lastRead current
  await prisma.conversationMember.update({
    where: { id: member.id },
    data: { lastReadAt: new Date() },
  });

  for (const peer of peers) {
    await createNotification({
      userId: peer.userId,
      type: 'MESSAGE',
      title: 'New message',
      body: body?.slice(0, 80) || 'Sent you a media message',
      data: { conversationId, messageId: message.id, senderId: userId },
    });
  }

  return {
    ...mapMessage(message, userId),
    peerIds: peers.map((p) => p.userId),
  };
}

export async function editMessage(userId: string, messageId: string, body: string) {
  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: messageInclude,
  });
  if (!message || message.deletedAt) throw new AppError(404, 'Message not found');
  if (message.senderId !== userId) throw new AppError(403, 'Can only edit your own messages');
  if (message.type !== 'TEXT') throw new AppError(400, 'Only text messages can be edited');

  const text = sanitizeText(body.trim(), 4000);
  if (!text) throw new AppError(400, 'Message body is required');

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { body: text, editedAt: new Date() },
    include: messageInclude,
  });

  const peers = await prisma.conversationMember.findMany({
    where: { conversationId: message.conversationId, userId: { not: userId } },
    select: { userId: true },
  });

  return {
    ...mapMessage(updated, userId),
    peerIds: peers.map((p) => p.userId),
  };
}

export async function deleteMessage(userId: string, messageId: string) {
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message || message.deletedAt) throw new AppError(404, 'Message not found');
  if (message.senderId !== userId) throw new AppError(403, 'Can only delete your own messages');

  const updated = await prisma.message.update({
    where: { id: messageId },
    data: { deletedAt: new Date(), body: null, mediaUrl: null, fileName: null },
    include: messageInclude,
  });

  const peers = await prisma.conversationMember.findMany({
    where: { conversationId: message.conversationId, userId: { not: userId } },
    select: { userId: true },
  });

  return {
    ...mapMessage(updated, userId),
    peerIds: peers.map((p) => p.userId),
  };
}

export async function markConversationRead(userId: string, conversationId: string) {
  const member = await assertMember(userId, conversationId);
  const now = new Date();

  await prisma.conversationMember.update({
    where: { id: member.id },
    data: { lastReadAt: now },
  });

  const result = await prisma.message.updateMany({
    where: {
      conversationId,
      senderId: { not: userId },
      deletedAt: null,
      seenAt: null,
    },
    data: { seenAt: now, deliveredAt: now },
  });

  const peers = await prisma.conversationMember.findMany({
    where: { conversationId, userId: { not: userId } },
    select: { userId: true },
  });

  return {
    conversationId,
    seenAt: now.toISOString(),
    count: result.count,
    peerIds: peers.map((p) => p.userId),
  };
}

export async function markMessagesDelivered(userId: string, conversationId: string) {
  await assertMember(userId, conversationId);
  const now = new Date();
  const result = await prisma.message.updateMany({
    where: {
      conversationId,
      senderId: { not: userId },
      deletedAt: null,
      deliveredAt: null,
    },
    data: { deliveredAt: now },
  });
  const peers = await prisma.conversationMember.findMany({
    where: { conversationId, userId: { not: userId } },
    select: { userId: true },
  });
  return {
    conversationId,
    deliveredAt: now.toISOString(),
    count: result.count,
    peerIds: peers.map((p) => p.userId),
  };
}

export async function openChatWithPeer(userId: string, peerId: string) {
  const conversation = await getOrCreateDirectConversation(userId, peerId);
  const peer = conversation.members.find((m) => m.userId !== userId)?.user;
  return {
    id: conversation.id,
    peer: peer ? mapUser(peer) : null,
  };
}

export async function isConversationMember(userId: string, conversationId: string) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  return Boolean(member);
}

export async function getConversationPeerIds(conversationId: string, excludeUserId?: string) {
  const members = await prisma.conversationMember.findMany({
    where: {
      conversationId,
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
    select: { userId: true },
  });
  return members.map((m) => m.userId);
}
