import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';

export async function getStudentCampusHome(userId: string, departmentId: string) {
  const now = new Date();
  const [events, announcements, pendingFriends, recentLogins] = await Promise.all([
    prisma.departmentEvent.findMany({
      where: { departmentId, published: true, startsAt: { gte: now } },
      orderBy: { startsAt: 'asc' },
      take: 10,
    }),
    prisma.announcement.findMany({
      where: { departmentId },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
    prisma.friendRequest.count({
      where: { receiverId: userId, status: 'PENDING' },
    }),
    prisma.loginHistory.count({
      where: {
        userId,
        success: true,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  return {
    upcomingEvents: events,
    announcements,
    pendingFriendRequests: pendingFriends,
    loginsThisWeek: recentLogins,
  };
}

export async function listStudentEvents(departmentId: string) {
  return prisma.departmentEvent.findMany({
    where: { departmentId, published: true },
    orderBy: { startsAt: 'asc' },
  });
}

export async function listStudentAnnouncements(departmentId: string) {
  return prisma.announcement.findMany({
    where: { departmentId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getStudentCalendar(departmentId: string, from?: string, to?: string) {
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
  const toDate = to ? new Date(to) : new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

  const events = await prisma.departmentEvent.findMany({
    where: {
      departmentId,
      published: true,
      startsAt: { gte: fromDate, lte: toDate },
    },
    orderBy: { startsAt: 'asc' },
  });

  return events.map((e) => ({
    id: e.id,
    title: e.name,
    start: e.startsAt,
    end: e.endsAt,
    venue: e.venue,
    type: 'event' as const,
  }));
}

export async function getStudentNotifications(userId: string) {
  const [friendRequests, announcements, upcomingEvents, user] = await Promise.all([
    prisma.friendRequest.findMany({
      where: { receiverId: userId, status: 'PENDING' },
      include: {
        sender: { include: { profile: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    }).then(async (u) => {
      if (!u) return [];
      return prisma.announcement.findMany({
        where: { departmentId: u.departmentId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { departmentId: true },
    }).then(async (u) => {
      if (!u) return [];
      return prisma.departmentEvent.findMany({
        where: {
          departmentId: u.departmentId,
          published: true,
          startsAt: { gte: new Date(), lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { startsAt: 'asc' },
        take: 10,
      });
    }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);

  if (!user) throw new AppError(404, 'User not found');

  const items = [
    ...friendRequests.map((r) => ({
      id: `fr-${r.id}`,
      type: 'FRIEND_REQUEST' as const,
      title: 'Friend request',
      body: `${r.sender.profile?.name ?? 'Someone'} wants to connect`,
      createdAt: r.createdAt,
      meta: { requestId: r.id, userId: r.senderId },
    })),
    ...announcements.map((a) => ({
      id: `an-${a.id}`,
      type: 'ANNOUNCEMENT' as const,
      title: a.title,
      body: a.body.slice(0, 120),
      createdAt: a.createdAt,
      meta: { announcementId: a.id },
    })),
    ...upcomingEvents.map((e) => ({
      id: `ev-${e.id}`,
      type: 'EVENT_REMINDER' as const,
      title: 'Upcoming event',
      body: `${e.name} · ${e.startsAt.toLocaleString()}`,
      createdAt: e.createdAt,
      meta: { eventId: e.id },
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return { items, unread: items.length };
}

export async function listCommunities(departmentId: string) {
  // Department acts as the primary community until multi-community is enabled.
  const department = await prisma.department.findUnique({ where: { id: departmentId } });
  if (!department) return [];

  const memberCount = await prisma.user.count({
    where: { departmentId, role: 'STUDENT', deletedAt: null },
  });

  return [
    {
      id: department.id,
      name: department.name,
      description: `Official ${department.name} student community`,
      memberCount,
      type: 'DEPARTMENT' as const,
    },
  ];
}
