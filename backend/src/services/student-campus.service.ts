import { prisma } from '../lib/prisma.js';

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

/** Real Notification table only — no synthetic fr-/an-/ev- ids. */
export async function getStudentNotifications(userId: string) {
  const { listNotifications } = await import('./notification.service.js');
  return listNotifications(userId);
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
