import { FriendRequestStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { emitToUser } from '../socket.js';

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

  if (await isBlockedEitherWay(senderId, receiverId)) {
    throw new AppError(403, 'Cannot send friend request — user is blocked');
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
  if (existing?.status === FriendRequestStatus.BLOCKED) {
    throw new AppError(403, 'Cannot send friend request — user is blocked');
  }

  const reverse = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId: receiverId, receiverId: senderId } },
  });

  if (reverse?.status === FriendRequestStatus.ACCEPTED) {
    throw new AppError(409, 'Already friends');
  }

  if (reverse?.status === FriendRequestStatus.PENDING) {
    // Mutual request → auto-accept
    const updated = await prisma.friendRequest.update({
      where: { id: reverse.id },
      data: { status: FriendRequestStatus.ACCEPTED, acceptedAt: new Date() },
      include: requestIncludes,
    });
    const { createNotification, deleteFriendRequestNotifications } =
      await import('./notification.service.js');
    // reverse: peer (receiverId) had sent pending to us (senderId) — auto-accept
    await deleteFriendRequestNotifications(senderId, reverse.id);
    const peerName = updated.sender.profile?.name ?? updated.sender.regNo;
    const selfName = updated.receiver.profile?.name ?? updated.receiver.regNo;
    await createNotification({
      userId: receiverId,
      type: 'FRIEND_ACCEPTED',
      title: 'You are now friends',
      body: `${selfName} is now your friend`,
      data: { userId: senderId, requestId: reverse.id },
    });
    await createNotification({
      userId: senderId,
      type: 'FRIEND_ACCEPTED',
      title: 'You are now friends',
      body: `${peerName} is now your friend`,
      data: { userId: receiverId, requestId: reverse.id },
    });
    emitToUser(senderId, 'friend:accept', {
      requestId: reverse.id,
      userId: receiverId,
      name: selfName,
    });
    emitToUser(receiverId, 'friend:accept', {
      requestId: reverse.id,
      userId: senderId,
      name: peerName,
    });
    return updated;
  }

  if (existing?.status === FriendRequestStatus.REJECTED || existing?.status === FriendRequestStatus.CANCELLED) {
    const reopened = await prisma.friendRequest.update({
      where: { id: existing.id },
      data: { status: FriendRequestStatus.PENDING },
      include: requestIncludes,
    });
    await notifyFriendRequest(senderId, receiverId, reopened.id);
    return reopened;
  }

  const created = await prisma.friendRequest.create({
    data: { senderId, receiverId },
    include: requestIncludes,
  });

  await notifyFriendRequest(senderId, receiverId, created.id);
  return created;
}

async function notifyFriendRequest(senderId: string, receiverId: string, requestId: string) {
  const { createNotification } = await import('./notification.service.js');
  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    include: { profile: true },
  });
  const name = sender?.profile?.name ?? 'Someone';
  await createNotification({
    userId: receiverId,
    type: 'FRIEND_REQUEST',
    title: 'Friend request',
    body: `${name} sent you a friend request`,
    data: { userId: senderId, requestId, senderName: name },
  });
  emitToUser(receiverId, 'friend:request', {
    requestId,
    fromUserId: senderId,
    fromName: name,
  });
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

  const { createNotification, deleteFriendRequestNotifications } =
    await import('./notification.service.js');
  await deleteFriendRequestNotifications(userId, requestId);
  const accepterName = request.receiver.profile?.name ?? request.receiver.regNo;
  const senderName = request.sender.profile?.name ?? request.sender.regNo;
  await createNotification({
    userId: request.senderId,
    type: 'FRIEND_ACCEPTED',
    title: 'Friend request accepted',
    body: `${accepterName} accepted your request`,
    data: { userId: request.receiverId, requestId },
  });
  await createNotification({
    userId: request.receiverId,
    type: 'FRIEND_ACCEPTED',
    title: 'You are now friends',
    body: `You and ${senderName} are now friends`,
    data: { userId: request.senderId, requestId },
  });

  emitToUser(request.senderId, 'friend:accept', {
    requestId,
    userId: request.receiverId,
    name: accepterName,
  });
  emitToUser(request.receiverId, 'friend:accept', {
    requestId,
    userId: request.senderId,
    name: senderName,
  });

  return updated;
}

/** Accept by peer user id (from profile / search) */
export async function acceptFriendRequestByUserId(userId: string, senderId: string) {
  const request = await prisma.friendRequest.findFirst({
    where: {
      senderId,
      receiverId: userId,
      status: FriendRequestStatus.PENDING,
    },
  });
  if (!request) throw new AppError(404, 'Friend request not found');
  return acceptFriendRequest(userId, request.id);
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

  const updated = await prisma.friendRequest.update({
    where: { id: requestId },
    data: { status: FriendRequestStatus.REJECTED },
    include: requestIncludes,
  });

  const { deleteFriendRequestNotifications } = await import('./notification.service.js');
  await deleteFriendRequestNotifications(userId, requestId);
  emitToUser(request.senderId, 'friend:reject', { requestId, userId });

  return updated;
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

  const updated = await prisma.friendRequest.update({
    where: { id: requestId },
    data: { status: FriendRequestStatus.CANCELLED },
    include: requestIncludes,
  });

  const { deleteFriendRequestNotifications } = await import('./notification.service.js');
  await deleteFriendRequestNotifications(request.receiverId, requestId);
  emitToUser(request.receiverId, 'friend:cancel', { requestId, userId });

  return updated;
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

export async function unfriend(userId: string, friendId: string) {
  const rows = await prisma.friendRequest.findMany({
    where: {
      status: FriendRequestStatus.ACCEPTED,
      OR: [
        { senderId: userId, receiverId: friendId },
        { senderId: friendId, receiverId: userId },
      ],
    },
  });
  if (!rows.length) throw new AppError(404, 'Friendship not found');
  await prisma.friendRequest.updateMany({
    where: { id: { in: rows.map((r) => r.id) } },
    data: { status: FriendRequestStatus.CANCELLED },
  });
  return { message: 'Unfriended' };
}

/** Block peer: ends friendship and prevents new requests from either direction. */
export async function blockUser(userId: string, targetId: string) {
  if (userId === targetId) throw new AppError(400, 'Cannot block yourself');
  const target = await prisma.user.findFirst({
    where: { id: targetId, deletedAt: null },
  });
  if (!target) throw new AppError(404, 'User not found');

  const existing = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId: userId, receiverId: targetId } },
  });
  const reverse = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId: targetId, receiverId: userId } },
  });

  if (existing) {
    await prisma.friendRequest.update({
      where: { id: existing.id },
      data: { status: FriendRequestStatus.BLOCKED },
    });
  } else {
    await prisma.friendRequest.create({
      data: {
        senderId: userId,
        receiverId: targetId,
        status: FriendRequestStatus.BLOCKED,
      },
    });
  }
  if (reverse && reverse.status !== FriendRequestStatus.BLOCKED) {
    await prisma.friendRequest.update({
      where: { id: reverse.id },
      data: { status: FriendRequestStatus.CANCELLED },
    });
  }
  return { message: 'User blocked' };
}

export async function unblockUser(userId: string, targetId: string) {
  const existing = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId: userId, receiverId: targetId } },
  });
  if (!existing || existing.status !== FriendRequestStatus.BLOCKED) {
    throw new AppError(404, 'Block not found');
  }
  await prisma.friendRequest.update({
    where: { id: existing.id },
    data: { status: FriendRequestStatus.CANCELLED },
  });
  return { message: 'User unblocked' };
}

export async function listBlockedUsers(userId: string) {
  const rows = await prisma.friendRequest.findMany({
    where: { senderId: userId, status: FriendRequestStatus.BLOCKED },
    include: {
      receiver: { include: { profile: true, department: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.receiver.id,
    regNo: r.receiver.regNo,
    name: r.receiver.profile?.name ?? r.receiver.regNo,
    department: r.receiver.department.name,
    profilePhotoUrl: r.receiver.profile?.profilePhotoUrl ?? null,
    blockedAt: r.updatedAt.toISOString(),
  }));
}

export async function isBlockedEitherWay(a: string, b: string): Promise<boolean> {
  const row = await prisma.friendRequest.findFirst({
    where: {
      status: FriendRequestStatus.BLOCKED,
      OR: [
        { senderId: a, receiverId: b },
        { senderId: b, receiverId: a },
      ],
    },
  });
  return Boolean(row);
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