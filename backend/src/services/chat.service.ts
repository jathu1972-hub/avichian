import { MessageType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { areFriends } from './friends.service.js';
import { createNotification } from './notification.service.js';

const userPreview = {
  id: true,
  regNo: true,
  online: true,
  profile: { select: { name: true, profilePhotoUrl: true, year: true } },
  department: { select: { name: true } },
} as const;

function mapUser(u: {
  id: string;
  regNo: string;
  online: boolean;
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
  };
}

export async function getOrCreateDirectConversation(userId: string, peerId: string) {
  if (userId === peerId) throw new AppError(400, 'Cannot chat with yourself');
  if (!(await areFriends(userId, peerId))) {
    throw new AppError(403, 'You can only chat with accepted friends');
  }

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

  return memberships.map((m) => {
    const peer = m.conversation.members.find((x) => x.userId !== userId)?.user;
    const last = m.conversation.messages[0];
    return {
      id: m.conversation.id,
      peer: peer ? mapUser(peer) : null,
      lastMessage: last
        ? {
            id: last.id,
            body: last.body,
            type: last.type,
            createdAt: last.createdAt,
            senderId: last.senderId,
          }
        : null,
      updatedAt: m.conversation.updatedAt,
    };
  });
}

export async function listMessages(userId: string, conversationId: string, cursor?: string) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!member) throw new AppError(403, 'Not a member of this conversation');

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      deletedAt: null,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
    include: { sender: { select: userPreview } },
  });

  await prisma.conversationMember.update({
    where: { id: member.id },
    data: { lastReadAt: new Date() },
  });

  await prisma.message.updateMany({
    where: {
      conversationId,
      senderId: { not: userId },
      seenAt: null,
    },
    data: { seenAt: new Date() },
  });

  return messages.reverse().map((m) => ({
    id: m.id,
    body: m.body,
    type: m.type,
    mediaUrl: m.mediaUrl,
    senderId: m.senderId,
    sender: mapUser(m.sender),
    seenAt: m.seenAt,
    createdAt: m.createdAt,
    isMine: m.senderId === userId,
  }));
}

export async function sendMessage(
  userId: string,
  conversationId: string,
  data: { body?: string; type?: MessageType; mediaUrl?: string },
) {
  const member = await prisma.conversationMember.findUnique({
    where: { conversationId_userId: { conversationId, userId } },
  });
  if (!member) throw new AppError(403, 'Not a member of this conversation');

  if (!data.body?.trim() && !data.mediaUrl) {
    throw new AppError(400, 'Message body or media is required');
  }

  const message = await prisma.message.create({
    data: {
      conversationId,
      senderId: userId,
      body: data.body?.trim() || null,
      type: data.type ?? 'TEXT',
      mediaUrl: data.mediaUrl ?? null,
    },
    include: { sender: { select: userPreview } },
  });

  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  const peers = await prisma.conversationMember.findMany({
    where: { conversationId, userId: { not: userId } },
  });

  for (const peer of peers) {
    await createNotification({
      userId: peer.userId,
      type: 'MESSAGE',
      title: 'New message',
      body: data.body?.slice(0, 80) || 'Sent you a media message',
      data: { conversationId, messageId: message.id, senderId: userId },
    });
  }

  return {
    id: message.id,
    body: message.body,
    type: message.type,
    mediaUrl: message.mediaUrl,
    senderId: message.senderId,
    sender: mapUser(message.sender),
    seenAt: message.seenAt,
    createdAt: message.createdAt,
    isMine: true,
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
