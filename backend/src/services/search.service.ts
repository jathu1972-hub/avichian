import { FriendRequestStatus } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getFriendIds } from './friends.service.js';

export type SearchFilters = {
  q?: string;
  type?: 'all' | 'students' | 'communities' | 'events';
  department?: string;
  year?: number;
  sort?: 'az' | 'recent' | 'active';
  limit?: number;
};

export async function searchStudents(
  viewerId: string,
  query: string,
  limit = 20,
  filters?: { department?: string; year?: number; sort?: string },
) {
  const q = query.trim();
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

  const yearNum = filters?.year ?? (Number(q) > 0 && Number(q) < 100 ? Number(q) : null);

  const users = await prisma.user.findMany({
    where: {
      role: 'STUDENT',
      deletedAt: null,
      accountStatus: 'ACTIVE',
      id: { not: viewerId },
      ...(filters?.department
        ? { department: { name: { contains: filters.department, mode: 'insensitive' } } }
        : {}),
      ...(yearNum ? { profile: { year: yearNum } } : {}),
      ...(q.length
        ? {
            OR: [
              { regNo: { contains: q, mode: 'insensitive' as const } },
              { profile: { name: { contains: q, mode: 'insensitive' as const } } },
              { email: { contains: q, mode: 'insensitive' as const } },
              { department: { name: { contains: q, mode: 'insensitive' as const } } },
              ...(yearNum && !filters?.year ? [{ profile: { year: yearNum } }] : []),
            ],
          }
        : {}),
    },
    include: {
      profile: true,
      department: true,
    },
    take: Math.min(limit, 50),
    orderBy:
      filters?.sort === 'recent'
        ? { createdAt: 'desc' as const }
        : filters?.sort === 'active'
          ? { lastSeen: 'desc' as const }
          : { regNo: 'asc' as const },
  });

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
      kind: 'student' as const,
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
      joinedAt: user.createdAt.toISOString(),
    };
  });
}

export async function unifiedSearch(viewerId: string, filters: SearchFilters) {
  const q = (filters.q ?? '').trim();
  const type = filters.type ?? 'all';
  const limit = Math.min(filters.limit ?? 24, 50);

  if (q.length < 1 && type === 'students') return { students: [], communities: [], events: [] };

const [students, communities, events] = await Promise.all([
    type === 'all' || type === 'students'
      ? searchStudents(viewerId, q, limit, {
          department: filters.department,
          year: filters.year,
          sort: filters.sort ?? (q ? 'az' : 'recent'),
        })
      : Promise.resolve([]),
    type === 'all' || type === 'communities'
      ? searchCommunities(q, limit)
      : Promise.resolve([]),
    type === 'all' || type === 'events' ? searchEvents(q, limit) : Promise.resolve([]),
  ]);

  return {
    students,
    communities,
    events,
  };
}

async function searchCommunities(q: string, limit: number) {
  if (q.length < 1) {
    const rows = await prisma.community.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 12),
      include: { _count: { select: { members: true } } },
    });
    return rows.map((c) => ({
      kind: 'community' as const,
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      coverUrl: c.bannerUrl ?? c.iconUrl,
      memberCount: c._count.members || c.memberCount,
    }));
  }
  const rows = await prisma.community.findMany({
    where: {
      status: 'ACTIVE',
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: limit,
    include: { _count: { select: { members: true } } },
  });
  return rows.map((c) => ({
    kind: 'community' as const,
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    coverUrl: c.bannerUrl ?? c.iconUrl,
    memberCount: c._count.members || c.memberCount,
  }));
}

async function searchEvents(q: string, limit: number) {
  const now = new Date();
  if (q.length < 1) {
    const rows = await prisma.campusEvent.findMany({
      where: { published: true, startsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: Math.min(limit, 12),
    });
    return rows.map((e) => ({
      kind: 'event' as const,
      id: e.id,
      title: e.title,
      startsAt: e.startsAt.toISOString(),
      venue: e.venue,
      coverUrl: e.bannerUrl,
    }));
  }
  const rows = await prisma.campusEvent.findMany({
    where: {
      published: true,
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { venue: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: limit,
    orderBy: { startsAt: 'desc' },
  });
  return rows.map((e) => ({
    kind: 'event' as const,
    id: e.id,
    title: e.title,
    startsAt: e.startsAt.toISOString(),
    venue: e.venue,
    coverUrl: e.bannerUrl,
  }));
}
