import { prisma } from '../../lib/prisma.js';

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export async function getDashboardStats() {
  const today = startOfToday();
  const weekAgo = daysAgo(7);
  const twoWeeksAgo = daysAgo(14);

  const [
    totalStudents,
    totalStaff,
    departments,
    onlineUsers,
    activeUsers,
    blockedUsers,
    newStudentsThisWeek,
    newStudentsLastWeek,
    loginsToday,
    auditToday,
    registeredStudents,
    totalPosts,
    postsToday,
    messagesToday,
    callsToday,
    events,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'STUDENT', deletedAt: null } }),
    prisma.user.count({ where: { role: 'STAFF', deletedAt: null } }),
    prisma.department.count(),
    prisma.user.count({ where: { online: true, deletedAt: null } }),
    prisma.user.count({
      where: { lastLoginAt: { gte: weekAgo }, deletedAt: null },
    }),
    prisma.user.count({ where: { accountStatus: 'SUSPENDED', deletedAt: null } }),
    prisma.user.count({
      where: { role: 'STUDENT', createdAt: { gte: weekAgo }, deletedAt: null },
    }),
    prisma.user.count({
      where: {
        role: 'STUDENT',
        createdAt: { gte: twoWeeksAgo, lt: weekAgo },
        deletedAt: null,
      },
    }),
    prisma.loginHistory.count({
      where: { success: true, createdAt: { gte: today } },
    }),
    prisma.auditLog.count({ where: { createdAt: { gte: today } } }),
    prisma.studentMaster.count({ where: { verified: true } }),
    prisma.post.count({ where: { deletedAt: null } }),
    prisma.post.count({ where: { deletedAt: null, createdAt: { gte: today } } }),
    prisma.message.count({ where: { createdAt: { gte: today } } }).catch(() => 0),
    prisma.callHistory.count({ where: { startedAt: { gte: today } } }).catch(() => 0),
    prisma.departmentEvent.count(),
  ]);

  const studentTrend =
    newStudentsLastWeek === 0
      ? newStudentsThisWeek > 0
        ? 100
        : 0
      : Math.round(((newStudentsThisWeek - newStudentsLastWeek) / newStudentsLastWeek) * 100);

  return {
    totalStudents,
    totalStaff,
    departments,
    totalPosts,
    postsToday,
    messagesToday,
    callsToday,
    videoCalls: callsToday,
    events,
    activeUsers,
    onlineUsers,
    storageUsedBytes: 0,
    storageUsedLabel: '0 B',
    reports: 0,
    blockedUsers,
    masterRoster: registeredStudents,
    loginsToday,
    auditEventsToday: auditToday,
    apiStatus: 'ok',
    systemHealth: 'healthy',
    trends: {
      students: studentTrend,
      staff: 0,
      activeUsers: 0,
    },
  };
}