import { prisma } from '../../lib/prisma.js';
import { AppError } from '../../utils/errors.js';
import { writeAuditLog } from '../audit.service.js';
import type { ContentReportReason, ContentReportStatus } from '@prisma/client';

export async function listPostsForModeration(params: { search?: string; includeDeleted?: boolean }) {
  const posts = await prisma.post.findMany({
    where: {
      ...(params.includeDeleted ? {} : { deletedAt: null }),
      ...(params.search
        ? {
            OR: [
              { caption: { contains: params.search, mode: 'insensitive' } },
              { author: { regNo: { contains: params.search, mode: 'insensitive' } } },
              { author: { profile: { name: { contains: params.search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    },
    take: 50,
    orderBy: { createdAt: 'desc' },
    include: {
      author: { include: { profile: true, department: true } },
      _count: { select: { likes: true } },
    },
  });

  return posts.map((p) => ({
    id: p.id,
    caption: p.caption,
    mediaUrl: p.mediaUrl,
    visibility: p.visibility,
    createdAt: p.createdAt,
    deletedAt: p.deletedAt,
    likeCount: p._count.likes,
    author: {
      id: p.authorId,
      regNo: p.author.regNo,
      name: p.author.profile?.name ?? p.author.regNo,
      department: p.author.department.name,
    },
  }));
}

export async function softDeletePost(
  postId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const post = await prisma.post.update({
    where: { id: postId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedById: adminId,
    },
  });
  await writeAuditLog({
    userId: adminId,
    action: 'CONTENT_DELETED',
    resourceType: 'post',
    resourceId: postId,
    metadata: { authorId: post.authorId, byAdmin: true, soft: true },
    ...meta,
  });
  return { message: 'Post deleted' };
}

export async function restorePost(
  postId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  await prisma.post.update({
    where: { id: postId },
    data: {
      isDeleted: false,
      deletedAt: null,
      deletedById: null,
      archivedAt: null,
    },
  });
  await writeAuditLog({
    userId: adminId,
    action: 'CONTENT_RESTORED',
    resourceType: 'post',
    resourceId: postId,
    metadata: { byAdmin: true },
    ...meta,
  });
  return { message: 'Post restored' };
}

export async function softDeleteStory(
  storyId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const story = await prisma.story.findUnique({ where: { id: storyId } });
  if (!story) throw new AppError(404, 'Story not found');
  await prisma.story.update({
    where: { id: storyId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedById: adminId,
    },
  });
  await writeAuditLog({
    userId: adminId,
    action: 'CONTENT_DELETED',
    resourceType: 'story',
    resourceId: storyId,
    metadata: { userId: story.userId, byAdmin: true, soft: true },
    ...meta,
  });
  return { message: 'Story deleted' };
}

export async function softDeleteReel(
  reelId: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const reel = await prisma.reel.findUnique({ where: { id: reelId } });
  if (!reel) throw new AppError(404, 'Reel not found');
  await prisma.reel.update({
    where: { id: reelId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedById: adminId,
    },
  });
  await writeAuditLog({
    userId: adminId,
    action: 'CONTENT_DELETED',
    resourceType: 'reel',
    resourceId: reelId,
    metadata: { authorId: reel.authorId, byAdmin: true, soft: true },
    ...meta,
  });
  return { message: 'Reel deleted' };
}

export async function listReports(status?: ContentReportStatus) {
  const reports = await prisma.contentReport.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: {
      reporter: { include: { profile: true } },
      targetUser: { include: { profile: true } },
    },
  });

  return reports.map((r) => ({
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    details: r.details,
    status: r.status,
    adminNotes: r.adminNotes,
    createdAt: r.createdAt,
    resolvedAt: r.resolvedAt,
    reporter: {
      id: r.reporterId,
      name: r.reporter.profile?.name ?? r.reporter.regNo,
      regNo: r.reporter.regNo,
    },
    targetUser: r.targetUser
      ? {
          id: r.targetUser.id,
          name: r.targetUser.profile?.name ?? r.targetUser.regNo,
          regNo: r.targetUser.regNo,
        }
      : null,
  }));
}

export async function createReport(params: {
  reporterId: string;
  targetType: 'POST' | 'STORY' | 'MESSAGE' | 'USER' | 'COMMENT';
  targetId: string;
  targetUserId?: string;
  reason: ContentReportReason;
  details?: string;
}) {
  return prisma.contentReport.create({
    data: {
      reporterId: params.reporterId,
      targetType: params.targetType,
      targetId: params.targetId,
      targetUserId: params.targetUserId,
      reason: params.reason,
      details: params.details,
    },
  });
}

export async function resolveReport(
  reportId: string,
  adminId: string,
  data: {
    status: ContentReportStatus;
    adminNotes?: string;
    action?: 'delete_post' | 'suspend_user' | 'warn' | 'none';
  },
  meta: { ipAddress?: string; userAgent?: string },
) {
  const report = await prisma.contentReport.findUnique({ where: { id: reportId } });
  if (!report) throw new AppError(404, 'Report not found');

  if (data.action === 'delete_post' && report.targetType === 'POST') {
    await softDeletePost(report.targetId, adminId, meta);
  }
  if (data.action === 'suspend_user' && report.targetUserId) {
    await prisma.user.update({
      where: { id: report.targetUserId },
      data: { accountStatus: 'SUSPENDED', suspendedAt: new Date() },
    });
    await writeAuditLog({
      userId: adminId,
      action: 'USER_SUSPENDED',
      resourceType: 'user',
      resourceId: report.targetUserId,
      metadata: { fromReport: reportId },
      ...meta,
    });
  }
  if (data.action === 'warn' && report.targetUserId) {
    const target = await prisma.user.findUnique({
      where: { id: report.targetUserId },
      include: { profile: true },
    });
    await writeAuditLog({
      userId: adminId,
      action: 'USER_WARNED',
      resourceType: 'user',
      resourceId: report.targetUserId,
      metadata: {
        fromReport: reportId,
        notes: data.adminNotes,
        reason: data.adminNotes ?? report.reason,
        studentName: target?.profile?.name ?? target?.regNo,
        regNo: target?.regNo,
      },
      ...meta,
    });
  }

  await prisma.contentReport.update({
    where: { id: reportId },
    data: {
      status: data.status,
      adminNotes: data.adminNotes,
      resolvedById: adminId,
      resolvedAt: new Date(),
    },
  });

  await writeAuditLog({
    userId: adminId,
    action: data.status === 'CLOSED' ? 'REPORT_CLOSED' : 'REPORT_REVIEWED',
    resourceType: 'report',
    resourceId: reportId,
    metadata: { action: data.action, status: data.status },
    ...meta,
  });

  return { message: 'Report updated' };
}

export async function listCollegeAnnouncements() {
  return prisma.announcement.findMany({
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function createCollegeAnnouncement(
  data: {
    title: string;
    body: string;
    departmentId?: string;
    visibility?: string;
    year?: number;
  },
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  let departmentId = data.departmentId;
  if (!departmentId) {
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    departmentId = admin?.departmentId;
  }
  if (!departmentId) {
    const dept = await prisma.department.findFirst();
    departmentId = dept?.id;
  }
  if (!departmentId) throw new AppError(400, 'No department available for announcement');

  const ann = await prisma.announcement.create({
    data: {
      departmentId,
      title: data.title,
      body: data.body,
      visibility: data.visibility ?? 'DEPARTMENT',
      year: data.year,
      createdById: adminId,
    },
  });

  const { createNotification } = await import('../notification.service.js');
  const students = await prisma.user.findMany({
    where: {
      role: 'STUDENT',
      deletedAt: null,
      accountStatus: 'ACTIVE',
      ...(data.visibility === 'ALL' ? {} : { departmentId }),
      ...(data.year ? { profile: { year: data.year } } : {}),
    },
    select: { id: true },
    take: 2000,
  });
  await Promise.all(
    students.map((s) =>
      createNotification({
        userId: s.id,
        type: 'ANNOUNCEMENT',
        title: ann.title,
        body: ann.body.slice(0, 200),
        data: { announcementId: ann.id },
      }),
    ),
  );

  await writeAuditLog({
    userId: adminId,
    action: 'ANNOUNCEMENT_PUBLISHED',
    resourceType: 'announcement',
    resourceId: ann.id,
    metadata: { title: ann.title },
    ...meta,
  });

  return ann;
}

export async function deleteAnnouncement(
  id: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  await prisma.announcement.delete({ where: { id } });
  await writeAuditLog({
    userId: adminId,
    action: 'CONTENT_DELETED',
    resourceType: 'announcement',
    resourceId: id,
    ...meta,
  });
  return { message: 'Announcement deleted' };
}

export async function listCollegeEvents() {
  return prisma.departmentEvent.findMany({
    orderBy: { startsAt: 'desc' },
    take: 100,
  });
}

export async function createCollegeEvent(
  data: {
    name: string;
    description?: string;
    startsAt: string;
    venue?: string;
    departmentId?: string;
  },
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  let departmentId = data.departmentId;
  if (!departmentId) {
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    departmentId = admin?.departmentId;
  }
  if (!departmentId) {
    const dept = await prisma.department.findFirst();
    departmentId = dept?.id;
  }
  if (!departmentId) throw new AppError(400, 'No department available');

  const event = await prisma.departmentEvent.create({
    data: {
      departmentId,
      name: data.name,
      description: data.description,
      startsAt: new Date(data.startsAt),
      venue: data.venue,
      published: true,
      createdById: adminId,
    },
  });

  await writeAuditLog({
    userId: adminId,
    action: 'EVENT_PUBLISHED',
    resourceType: 'event',
    resourceId: event.id,
    metadata: { name: event.name },
    ...meta,
  });

  return event;
}

export async function deleteEvent(
  id: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  await prisma.departmentEvent.delete({ where: { id } });
  await writeAuditLog({
    userId: adminId,
    action: 'CONTENT_DELETED',
    resourceType: 'event',
    resourceId: id,
    ...meta,
  });
  return { message: 'Event deleted' };
}
