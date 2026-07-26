import { FriendRequestStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getFriendIds } from './friends.service.js';

export async function searchStudents(
  viewerId: string,
  query: string,
  limit = 20,
) {
  const q = query.trim();
  if (q.length < 2) {
    return [];
  }

  const friendIds = await getFriendIds(viewerId);

  const [pendingSent, pendingReceived] = await Promise.all([
    prisma.friendRequest.findMany({
      where: { senderId: viewerId, status: FriendRequestStatus.PENDING },
      select: { receiverId: true },
    }),
    prisma.friendRequest.findMany({
      where: { receiverId: viewerId, status: FriendRequestStatus.PENDING },
      select: { senderId: true },
    }),
  ]);

  const pendingOutgoing = new Set(pendingSent.map((r) => r.receiverId));
  const pendingIncoming = new Set(pendingReceived.map((r) => r.senderId));

  const yearNum = Number(q);
  const yearFilter = Number.isFinite(yearNum) && yearNum > 0 && yearNum < 100 ? yearNum : null;

  const users = await prisma.user.findMany({
    where: {
      role: 'STUDENT',
      deletedAt: null,
      accountStatus: 'ACTIVE',
      id: { not: viewerId },
      OR: [
        { regNo: { contains: q, mode: 'insensitive' } },
        { profile: { name: { contains: q, mode: 'insensitive' } } },
        { email: { contains: q, mode: 'insensitive' } },
        { department: { name: { contains: q, mode: 'insensitive' } } },
        ...(yearFilter ? [{ profile: { year: yearFilter } }] : []),
      ],
    },
    include: {
      profile: true,
      department: true,
    },
    take: limit,
    orderBy: { regNo: 'asc' },
  });

  // Mutual friends (shared accepted connections)
  const mutualByUser = new Map<string, number>();
  if (friendIds.length && users.length) {
    const candidateIds = users.map((u) => u.id);
    const edges = await prisma.friendRequest.findMany({
      where: {
        status: FriendRequestStatus.ACCEPTED,
        OR: [
          { senderId: { in: friendIds }, receiverId: { in: candidateIds } },
          { receiverId: { in: friendIds }, senderId: { in: candidateIds } },
        ],
      },
      select: { senderId: true, receiverId: true },
    });
    for (const e of edges) {
      const other = friendIds.includes(e.senderId) ? e.receiverId : e.senderId;
      if (!candidateIds.includes(other)) continue;
      mutualByUser.set(other, (mutualByUser.get(other) ?? 0) + 1);
    }
  }

  return users.map((user) => {
    let friendshipStatus: 'none' | 'friends' | 'pending_outgoing' | 'pending_incoming' = 'none';
    if (friendIds.includes(user.id)) friendshipStatus = 'friends';
    else if (pendingOutgoing.has(user.id)) friendshipStatus = 'pending_outgoing';
    else if (pendingIncoming.has(user.id)) friendshipStatus = 'pending_incoming';

    return {
      id: user.id,
      regNo: user.regNo,
      name: user.profile?.name ?? user.regNo,
      email: user.email,
      department: user.department.name,
      year: user.profile?.year ?? null,
      profilePhotoUrl: user.profile?.profilePhotoUrl ?? null,
      bio: user.profile?.bio ?? null,
      online: user.online,
      friendshipStatus,
      mutualFriends: mutualByUser.get(user.id) ?? 0,
    };
  });
}