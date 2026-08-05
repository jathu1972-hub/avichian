import type {
  ComplaintCategory,
  ComplaintPriority,
  ComplaintStatus,
  ContentReportReason,
  ContentReportStatus,
  ContentReportTarget,
} from '@prisma/client';
import { sanitizeText } from '@avichian/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { writeAuditLog } from './audit.service.js';
import { createNotification } from './notification.service.js';
import { blockUser as friendsBlock, isBlockedEitherWay, unfriend } from './friends.service.js';

const REPORT_REASONS = new Set<string>([
  'SPAM',
  'HARASSMENT',
  'BULLYING',
  'VIOLENCE',
  'FAKE_ACCOUNT',
  'ADULT_CONTENT',
  'ILLEGAL_CONTENT',
  'SCAM',
  'INAPPROPRIATE',
  'HATE_SPEECH',
  'THREATS',
  'NUDITY',
  'CHILD_SAFETY',
  'COPYRIGHT',
  'MISINFORMATION',
  'IMPERSONATION',
  'SELF_HARM',
  'TERRORISM',
  'INAPPROPRIATE_LANGUAGE',
  'OTHER',
]);

/** Map common UI labels to stored enum values */
export function normalizeReportReason(raw: string): ContentReportReason {
  const key = raw.trim().toUpperCase().replace(/[\s/-]+/g, '_');
  const aliases: Record<string, ContentReportReason> = {
    SEXUAL_CONTENT: 'ADULT_CONTENT',
    SEXUAL: 'ADULT_CONTENT',
    NUDITY: 'NUDITY',
    HATE: 'HATE_SPEECH',
    HATE_SPEECH: 'HATE_SPEECH',
    THREAT: 'THREATS',
    THREATS: 'THREATS',
    SCAM_FRAUD: 'SCAM',
    FRAUD: 'SCAM',
    COPYRIGHT_VIOLATION: 'COPYRIGHT',
    CHILD_SAFETY: 'CHILD_SAFETY',
    SELF_HARM_CONCERN: 'SELF_HARM',
    TERRORISM_EXTREMISM: 'TERRORISM',
    INAPPROPRIATE_LANGUAGE: 'INAPPROPRIATE_LANGUAGE',
    FAKE: 'FAKE_ACCOUNT',
  };
  if (aliases[key]) return aliases[key];
  if (REPORT_REASONS.has(key)) return key as ContentReportReason;
  return 'OTHER';
}

async function resolveTargetUserId(
  targetType: ContentReportTarget,
  targetId: string,
): Promise<string | null> {
  switch (targetType) {
    case 'USER':
      return targetId;
    case 'POST': {
      const p = await prisma.post.findUnique({ where: { id: targetId }, select: { authorId: true } });
      return p?.authorId ?? null;
    }
    case 'STORY': {
      const s = await prisma.story.findUnique({ where: { id: targetId }, select: { userId: true } });
      return s?.userId ?? null;
    }
    case 'REEL': {
      const r = await prisma.reel.findUnique({ where: { id: targetId }, select: { authorId: true } });
      return r?.authorId ?? null;
    }
    case 'COMMENT': {
      const c = await prisma.reelComment.findUnique({
        where: { id: targetId },
        select: { userId: true },
      });
      return c?.userId ?? null;
    }
    case 'MESSAGE': {
      const m = await prisma.message.findUnique({
        where: { id: targetId },
        select: { senderId: true },
      });
      return m?.senderId ?? null;
    }
    case 'COMMUNITY':
      return null;
    default:
      return null;
  }
}

export async function submitReport(params: {
  reporterId: string;
  targetType: ContentReportTarget;
  targetId: string;
  reason: string;
  details?: string;
  evidenceUrl?: string | null;
}) {
  if (params.reporterId === params.targetId && params.targetType === 'USER') {
    throw new AppError(400, 'Cannot report yourself');
  }

  const reason = normalizeReportReason(params.reason);
  const details =
    reason === 'OTHER' && !params.details?.trim()
      ? (() => {
          throw new AppError(400, 'Please describe the issue when selecting Other');
        })()
      : params.details
        ? sanitizeText(params.details, 1000)
        : null;

  // Duplicate guard: same reporter + target within 24h
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dup = await prisma.contentReport.findFirst({
    where: {
      reporterId: params.reporterId,
      targetType: params.targetType,
      targetId: params.targetId,
      createdAt: { gte: since },
      status: { in: ['OPEN', 'REVIEWING'] },
    },
  });
  if (dup) {
    throw new AppError(409, 'You already reported this recently. Our team is reviewing it.');
  }

  const targetUserId = await resolveTargetUserId(params.targetType, params.targetId);

  const report = await prisma.contentReport.create({
    data: {
      reporterId: params.reporterId,
      targetType: params.targetType,
      targetId: params.targetId,
      targetUserId,
      reason,
      details,
      evidenceUrl: params.evidenceUrl || null,
    },
  });

  await createNotification({
    userId: params.reporterId,
    type: 'ANNOUNCEMENT',
    title: 'Report submitted',
    body: 'Thanks. Our Super Admin team will review your report.',
    data: { reportId: report.id },
  });

  // Notify super admins
  const admins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', deletedAt: null },
    select: { id: true },
    take: 20,
  });
  await Promise.all(
    admins.map((a) =>
      createNotification({
        userId: a.id,
        type: 'ANNOUNCEMENT',
        title: 'New content report',
        body: `${params.targetType} · ${reason}`,
        data: { reportId: report.id, targetType: params.targetType, targetId: params.targetId },
      }),
    ),
  );

  await writeAuditLog({
    userId: params.reporterId,
    action: 'CONTENT_REPORTED',
    resourceType: params.targetType.toLowerCase(),
    resourceId: params.targetId,
    metadata: { reportId: report.id, reason },
  });

  return {
    id: report.id,
    status: report.status,
    message: 'Report submitted successfully',
  };
}

export async function listMyReports(userId: string) {
  const rows = await prisma.contentReport.findMany({
    where: { reporterId: userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    details: r.details,
    status: r.status,
    evidenceUrl: r.evidenceUrl,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  }));
}

export async function muteUser(muterId: string, mutedId: string) {
  if (muterId === mutedId) throw new AppError(400, 'Cannot mute yourself');
  const target = await prisma.user.findFirst({ where: { id: mutedId, deletedAt: null } });
  if (!target) throw new AppError(404, 'User not found');

  await prisma.userMute.upsert({
    where: { muterId_mutedId: { muterId, mutedId } },
    create: { muterId, mutedId },
    update: {},
  });
  return { message: 'User muted', muted: true };
}

export async function unmuteUser(muterId: string, mutedId: string) {
  await prisma.userMute.deleteMany({ where: { muterId, mutedId } });
  return { message: 'User unmuted', muted: false };
}

export async function listMutedUsers(muterId: string) {
  const rows = await prisma.userMute.findMany({
    where: { muterId },
    include: {
      muted: {
        select: {
          id: true,
          regNo: true,
          profile: { select: { name: true, profilePhotoUrl: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return rows.map((r) => ({
    id: r.muted.id,
    regNo: r.muted.regNo,
    name: r.muted.profile?.name ?? r.muted.regNo,
    profilePhotoUrl: r.muted.profile?.profilePhotoUrl ?? null,
    mutedAt: r.createdAt.toISOString(),
  }));
}

export async function getMutedIds(userId: string): Promise<string[]> {
  const rows = await prisma.userMute.findMany({
    where: { muterId: userId },
    select: { mutedId: true },
  });
  return rows.map((r) => r.mutedId);
}

export async function blockAndMuteCleanup(blockerId: string, blockedId: string) {
  if (await isBlockedEitherWay(blockerId, blockedId)) {
    // already blocked path still ensures mute
  }
  await friendsBlock(blockerId, blockedId);
  try {
    await unfriend(blockerId, blockedId);
  } catch {
    /* may not be friends */
  }
  await muteUser(blockerId, blockedId);
  return { message: 'User blocked', blocked: true };
}

function ticketNumber() {
  const n = Date.now().toString(36).toUpperCase();
  const r = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AVC-${n}-${r}`;
}

export async function submitComplaint(params: {
  userId: string;
  category: ComplaintCategory;
  subject: string;
  description: string;
  attachmentUrl?: string | null;
  priority?: ComplaintPriority;
}) {
  const subject = sanitizeText(params.subject, 200);
  const description = sanitizeText(params.description, 4000);
  if (!subject) throw new AppError(400, 'Subject is required');
  if (!description || description.length < 10) {
    throw new AppError(400, 'Please provide a longer description');
  }

  const complaint = await prisma.complaint.create({
    data: {
      ticketNumber: ticketNumber(),
      userId: params.userId,
      category: params.category,
      subject,
      description,
      attachmentUrl: params.attachmentUrl || null,
      priority: params.priority ?? 'MEDIUM',
    },
  });

  await createNotification({
    userId: params.userId,
    type: 'ANNOUNCEMENT',
    title: 'Complaint received',
    body: `Ticket ${complaint.ticketNumber} · we will review soon.`,
    data: { complaintId: complaint.id, ticketNumber: complaint.ticketNumber },
  });

  const admins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', deletedAt: null },
    select: { id: true },
    take: 20,
  });
  const critical = params.priority === 'CRITICAL' || params.priority === 'HIGH';
  await Promise.all(
    admins.map((a) =>
      createNotification({
        userId: a.id,
        type: 'ANNOUNCEMENT',
        title: critical ? 'Critical complaint' : 'New complaint',
        body: `${complaint.ticketNumber} · ${subject}`,
        data: { complaintId: complaint.id, priority: complaint.priority },
      }),
    ),
  );

  return {
    id: complaint.id,
    ticketNumber: complaint.ticketNumber,
    status: complaint.status,
    message: 'Complaint submitted',
  };
}

export async function listMyComplaints(userId: string) {
  const rows = await prisma.complaint.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((c) => ({
    id: c.id,
    ticketNumber: c.ticketNumber,
    category: c.category,
    subject: c.subject,
    description: c.description,
    attachmentUrl: c.attachmentUrl,
    priority: c.priority,
    status: c.status,
    adminNotes: c.adminNotes,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));
}

export async function adminListComplaints(status?: ComplaintStatus) {
  const rows = await prisma.complaint.findMany({
    where: status ? { status } : undefined,
    include: {
      user: {
        select: {
          id: true,
          regNo: true,
          profile: { select: { name: true } },
        },
      },
    },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });
  return rows.map((c) => ({
    id: c.id,
    ticketNumber: c.ticketNumber,
    category: c.category,
    subject: c.subject,
    description: c.description,
    attachmentUrl: c.attachmentUrl,
    priority: c.priority,
    status: c.status,
    adminNotes: c.adminNotes,
    createdAt: c.createdAt.toISOString(),
    user: {
      id: c.user.id,
      regNo: c.user.regNo,
      name: c.user.profile?.name ?? c.user.regNo,
    },
  }));
}

export async function adminUpdateComplaint(
  adminId: string,
  complaintId: string,
  data: { status?: ComplaintStatus; adminNotes?: string; priority?: ComplaintPriority },
) {
  const c = await prisma.complaint.update({
    where: { id: complaintId },
    data: {
      status: data.status,
      adminNotes: data.adminNotes,
      priority: data.priority,
      assignedAdminId: adminId,
    },
  });

  if (data.status === 'RESOLVED' || data.status === 'IN_PROGRESS') {
    await createNotification({
      userId: c.userId,
      type: 'ANNOUNCEMENT',
      title:
        data.status === 'RESOLVED'
          ? `Ticket ${c.ticketNumber} resolved`
          : `Ticket ${c.ticketNumber} under review`,
      body: data.adminNotes?.slice(0, 120) || c.subject,
      data: { complaintId: c.id },
    });
  }

  return c;
}

export async function adminListReportsEnhanced(status?: ContentReportStatus) {
  const rows = await prisma.contentReport.findMany({
    where: status ? { status } : undefined,
    include: {
      reporter: {
        select: {
          id: true,
          regNo: true,
          profile: { select: { name: true } },
        },
      },
      targetUser: {
        select: {
          id: true,
          regNo: true,
          profile: { select: { name: true } },
        },
      },
      actions: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          admin: {
            select: { regNo: true, profile: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return rows.map((r) => ({
    id: r.id,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    details: r.details,
    evidenceUrl: r.evidenceUrl,
    status: r.status,
    adminNotes: r.adminNotes,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    reporter: {
      id: r.reporter.id,
      regNo: r.reporter.regNo,
      name: r.reporter.profile?.name ?? r.reporter.regNo,
    },
    targetUser: r.targetUser
      ? {
          id: r.targetUser.id,
          regNo: r.targetUser.regNo,
          name: r.targetUser.profile?.name ?? r.targetUser.regNo,
        }
      : null,
    actions: r.actions.map((a) => ({
      id: a.id,
      action: a.action,
      notes: a.notes,
      createdAt: a.createdAt.toISOString(),
      admin: a.admin.profile?.name ?? a.admin.regNo,
    })),
  }));
}

export async function adminResolveReport(
  adminId: string,
  reportId: string,
  params: {
    status: ContentReportStatus;
    action?: string;
    adminNotes?: string;
  },
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const report = await prisma.contentReport.findUnique({ where: { id: reportId } });
  if (!report) throw new AppError(404, 'Report not found');

  const action = params.action ?? 'none';

  if (action === 'delete_post' && report.targetType === 'POST') {
    await prisma.post.update({
      where: { id: report.targetId },
      data: { isDeleted: true, deletedAt: new Date(), deletedById: adminId },
    });
  }
  if (action === 'delete_story' && report.targetType === 'STORY') {
    await prisma.story.update({
      where: { id: report.targetId },
      data: { isDeleted: true, deletedAt: new Date(), deletedById: adminId },
    });
  }
  if (action === 'delete_reel' && report.targetType === 'REEL') {
    await prisma.reel.update({
      where: { id: report.targetId },
      data: { isDeleted: true, deletedAt: new Date(), deletedById: adminId },
    });
  }
  if (action === 'delete_comment' && report.targetType === 'COMMENT') {
    await prisma.reelComment.update({
      where: { id: report.targetId },
      data: { isDeleted: true, body: '' },
    });
  }
  if (action === 'suspend_user' && report.targetUserId) {
    await prisma.user.update({
      where: { id: report.targetUserId },
      data: { accountStatus: 'SUSPENDED', suspendedAt: new Date() },
    });
  }
  if (action === 'ban_user' && report.targetUserId) {
    await prisma.user.update({
      where: { id: report.targetUserId },
      data: {
        accountStatus: 'SUSPENDED',
        suspendedAt: new Date(),
        deletedAt: new Date(),
      },
    });
  }
  if (action === 'warn' && report.targetUserId) {
    await createNotification({
      userId: report.targetUserId,
      type: 'ANNOUNCEMENT',
      title: 'Community guidelines warning',
      body: params.adminNotes || 'A Super Admin issued a warning on reported content.',
      data: { reportId },
    });
  }

  const updated = await prisma.contentReport.update({
    where: { id: reportId },
    data: {
      status: params.status,
      adminNotes: params.adminNotes,
      resolvedById: adminId,
      resolvedAt: new Date(),
    },
  });

  await prisma.moderationAction.create({
    data: {
      reportId,
      adminId,
      action,
      notes: params.adminNotes,
    },
  });

  await createNotification({
    userId: report.reporterId,
    type: 'ANNOUNCEMENT',
    title:
      params.status === 'REJECTED'
        ? 'Report closed'
        : params.status === 'ACTIONED'
          ? 'Action taken on your report'
          : 'Report update',
    body: params.adminNotes?.slice(0, 120) || `Status: ${params.status}`,
    data: { reportId },
  });

  await writeAuditLog({
    userId: adminId,
    action: 'REPORT_REVIEWED',
    resourceType: 'content_report',
    resourceId: reportId,
    metadata: { action, status: params.status },
    ...meta,
  });

  return updated;
}
