import { FriendRequestStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';

export async function getFriendIds(userId: string): Promise<string[]> {
  const requests = await prisma.friendRequest.findMany({
    where: {
      status: FriendRequestStatus.ACCEPTED,
      OR: [{ senderId: userId }, { receiverId: userId }],
    },
    select: { senderId: true, receiverId: true },
  });

  return requests.map((r) => (r.senderId === userId ? r.receiverId : r.senderId));
}

export async function areFriends(userId: string, otherId: string): Promise<boolean> {
  const friendIds = await getFriendIds(userId);
  return friendIds.includes(otherId);
}

export async function sendFriendRequest(senderId: string, receiverId: string) {
  if (senderId === receiverId) {
    throw new AppError(400, 'Cannot send a friend request to yourself');
  }

  const receiver = await prisma.user.findFirst({
    where: { id: receiverId, role: 'STUDENT', deletedAt: null },
  });
  if (!receiver) {
    throw new AppError(404, 'Student not found');
  }

  const existing = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId, receiverId } },
  });

  if (existing?.status === FriendRequestStatus.ACCEPTED) {
    throw new AppError(409, 'Already friends');
  }
  if (existing?.status === FriendRequestStatus.PENDING) {
    throw new AppError(409, 'Friend request already sent');
  }

  const reverse = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId: receiverId, receiverId: senderId } },
  });

  if (reverse?.status === FriendRequestStatus.PENDING) {
    return prisma.friendRequest.update({
      where: { id: reverse.id },
      data: { status: FriendRequestStatus.ACCEPTED },
      include: requestIncludes,
    });
  }

  if (existing?.status === FriendRequestStatus.REJECTED) {
    return prisma.friendRequest.update({
      where: { id: existing.id },
      data: { status: FriendRequestStatus.PENDING },
      include: requestIncludes,
    });
  }

  const created = await prisma.friendRequest.create({
    data: { senderId, receiverId },
    include: requestIncludes,
  });

  const { createNotification } = await import('./notification.service.js');
  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    include: { profile: true },
  });
  await createNotification({
    userId: receiverId,
    type: 'FRIEND_REQUEST',
    title: 'Friend request',
    body: `${sender?.profile?.name ?? 'Someone'} wants to connect`,
    data: { userId: senderId, requestId: created.id },
  });

  return created;
}

export async function acceptFriendRequest(userId: string, requestId: string) {
  const request = await prisma.friendRequest.findUnique({
    where: { id: requestId },
    include: requestIncludes,
  });

  if (!request || request.receiverId !== userId) {
    throw new AppError(404, 'Friend request not found');
  }
  if (request.status !== FriendRequestStatus.PENDING) {
    throw new AppError(400, 'Friend request is no longer pending');
  }

  const updated = await prisma.friendRequest.update({
    where: { id: requestId },
    data: { status: FriendRequestStatus.ACCEPTED, acceptedAt: new Date() },
    include: requestIncludes,
  });

  const { createNotification } = await import('./notification.service.js');
  await createNotification({
    userId: request.senderId,
    type: 'FRIEND_ACCEPTED',
    title: 'Friend request accepted',
    body: `${request.receiver.profile?.name ?? 'A student'} accepted your request`,
    data: { userId: request.receiverId, requestId },
  });

  return updated;
}

export async function rejectFriendRequest(userId: string, requestId: string) {
  const request = await prisma.friendRequest.findUnique({
    where: { id: requestId },
    include: requestIncludes,
  });

  if (!request || request.receiverId !== userId) {
    throw new AppError(404, 'Friend request not found');
  }
  if (request.status !== FriendRequestStatus.PENDING) {
    throw new AppError(400, 'Friend request is no longer pending');
  }

  return prisma.friendRequest.update({
    where: { id: requestId },
    data: { status: FriendRequestStatus.REJECTED },
    include: requestIncludes,
  });
}

/** Sender cancels an outgoing pending request */
export async function cancelFriendRequest(userId: string, requestId: string) {
  const request = await prisma.friendRequest.findUnique({
    where: { id: requestId },
    include: requestIncludes,
  });

  if (!request || request.senderId !== userId) {
    throw new AppError(404, 'Friend request not found');
  }
  if (request.status !== FriendRequestStatus.PENDING) {
    throw new AppError(400, 'Friend request is no longer pending');
  }

  return prisma.friendRequest.update({
    where: { id: requestId },
    data: { status: FriendRequestStatus.REJECTED },
    include: requestIncludes,
  });
}

export async function listFriends(userId: string) {
  const requests = await prisma.friendRequest.findMany({
    where: {
      status: FriendRequestStatus.ACCEPTED,
      OR: [{ senderId: userId }, { receiverId: userId }],
    },
    include: requestIncludes,
    orderBy: { updatedAt: 'desc' },
  });

  return requests.map((r) => {
    const friend = r.senderId === userId ? r.receiver : r.sender;
    return {
      id: friend.id,
      regNo: friend.regNo,
      name: friend.profile?.name ?? friend.regNo,
      department: friend.department.name,
      year: friend.profile?.year ?? null,
      profilePhotoUrl: friend.profile?.profilePhotoUrl ?? null,
      bio: friend.profile?.bio ?? null,
      online: friend.online,
      friendsSince: r.updatedAt.toISOString(),
    };
  });
}

export async function listPendingRequests(userId: string) {
  const [incoming, outgoing] = await Promise.all([
    prisma.friendRequest.findMany({
      where: { receiverId: userId, status: FriendRequestStatus.PENDING },
      include: requestIncludes,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.friendRequest.findMany({
      where: { senderId: userId, status: FriendRequestStatus.PENDING },
      include: requestIncludes,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const mapRequest = (r: Awaited<typeof incoming>[number], direction: 'incoming' | 'outgoing') => {
    const peer = direction === 'incoming' ? r.sender : r.receiver;
    return {
      id: r.id,
      direction,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      user: {
        id: peer.id,
        regNo: peer.regNo,
        name: peer.profile?.name ?? peer.regNo,
        department: peer.department.name,
        year: peer.profile?.year ?? null,
        profilePhotoUrl: peer.profile?.profilePhotoUrl ?? null,
      },
    };
  };

  return {
    incoming: incoming.map((r) => mapRequest(r, 'incoming')),
    outgoing: outgoing.map((r) => mapRequest(r, 'outgoing')),
  };
}

const requestIncludes = {
  sender: { include: { profile: true, department: true } },
  receiver: { include: { profile: true, department: true } },
} as const;