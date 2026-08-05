import type {
  CampusEventStatus,
  EventCategory,
  EventVisibility,
  PersonalEventType,
  Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { writeAuditLog } from './audit.service.js';
import { createNotification } from './notification.service.js';

const CATEGORIES: EventCategory[] = [
  'COLLEGE',
  'DEPARTMENT',
  'CLUBS',
  'WORKSHOPS',
  'SPORTS',
  'CULTURAL',
  'SEMINARS',
  'COMPETITIONS',
  'EXAMS',
  'HOLIDAYS',
  'OTHER',
];

function deriveStatus(startsAt: Date, endsAt: Date | null | undefined, current: CampusEventStatus): CampusEventStatus {
  if (current === 'CANCELLED' || current === 'HIDDEN' || current === 'DRAFT') return current;
  const now = Date.now();
  const start = startsAt.getTime();
  const end = endsAt ? endsAt.getTime() : start + 2 * 60 * 60 * 1000;
  if (now < start) return 'UPCOMING';
  if (now >= start && now <= end) return 'LIVE';
  return 'COMPLETED';
}

function mapEvent(
  e: {
    id: string;
    title: string;
    description: string;
    category: EventCategory;
    departmentId: string | null;
    venue: string | null;
    bannerUrl: string | null;
    organizer: string | null;
    speaker: string | null;
    capacity: number | null;
    registeredCount: number;
    interestedCount: number;
    startsAt: Date;
    endsAt: Date | null;
    registrationDeadline: Date | null;
    visibility: EventVisibility;
    status: CampusEventStatus;
    published: boolean;
    featured: boolean;
    gallery: Prisma.JsonValue;
    schedule: Prisma.JsonValue;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    department?: { id: string; name: string } | null;
    _count?: { participants: number; interests: number };
  },
  opts?: {
    joined?: boolean;
    interested?: boolean;
    bookmarked?: boolean;
  },
) {
  const status = deriveStatus(e.startsAt, e.endsAt, e.status);
  const remainingSeats =
    e.capacity != null ? Math.max(0, e.capacity - e.registeredCount) : null;
  const countdownMs = Math.max(0, e.startsAt.getTime() - Date.now());
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    category: e.category,
    departmentId: e.departmentId,
    department: e.department?.name ?? null,
    venue: e.venue,
    bannerUrl: e.bannerUrl,
    organizer: e.organizer,
    speaker: e.speaker,
    capacity: e.capacity,
    registeredCount: e.registeredCount,
    interestedCount: e.interestedCount,
    remainingSeats,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt?.toISOString() ?? null,
    registrationDeadline: e.registrationDeadline?.toISOString() ?? null,
    visibility: e.visibility,
    status,
    published: e.published,
    featured: e.featured,
    gallery: Array.isArray(e.gallery) ? e.gallery : [],
    schedule: Array.isArray(e.schedule) ? e.schedule : [],
    createdById: e.createdById,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    countdownMs,
    joined: opts?.joined ?? false,
    interested: opts?.interested ?? false,
    bookmarked: opts?.bookmarked ?? false,
  };
}

function visibilityWhere(userDepartmentId: string): Prisma.CampusEventWhereInput {
  return {
    OR: [
      { visibility: 'ALL_STUDENTS' },
      { visibility: 'DEPARTMENT_ONLY', departmentId: userDepartmentId },
      { departmentId: null },
    ],
  };
}

export async function listPublishedEvents(
  userId: string,
  departmentId: string,
  query: {
    search?: string;
    category?: string;
    filter?: string;
    status?: string;
  },
) {
  const now = new Date();
  const and: Prisma.CampusEventWhereInput[] = [
    { published: true },
    { status: { notIn: ['DRAFT', 'HIDDEN'] } },
    visibilityWhere(departmentId),
  ];

  if (query.category && query.category !== 'ALL' && CATEGORIES.includes(query.category as EventCategory)) {
    and.push({ category: query.category as EventCategory });
  }

  if (query.search?.trim()) {
    const q = query.search.trim();
    and.push({
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { organizer: { contains: q, mode: 'insensitive' } },
        { venue: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { department: { name: { contains: q, mode: 'insensitive' } } },
      ],
    });
  }

  const filter = (query.filter ?? '').toLowerCase();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
  endOfWeek.setHours(23, 59, 59, 999);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  if (filter === 'today') {
    and.push({ startsAt: { gte: startOfToday, lte: endOfToday } });
  } else if (filter === 'tomorrow') {
    const tomStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    and.push({ startsAt: { gte: tomStart, lte: endOfTomorrow } });
  } else if (filter === 'week' || filter === 'this_week') {
    and.push({ startsAt: { gte: startOfToday, lte: endOfWeek } });
  } else if (filter === 'month' || filter === 'this_month') {
    and.push({ startsAt: { gte: startOfToday, lte: endOfMonth } });
  } else if (filter === 'upcoming') {
    and.push({ startsAt: { gte: now }, status: { not: 'CANCELLED' } });
  } else if (filter === 'completed') {
    and.push({ OR: [{ status: 'COMPLETED' }, { endsAt: { lt: now } }, { startsAt: { lt: now } }] });
  } else if (filter === 'live') {
    and.push({ status: 'LIVE' });
  }

  if (query.status && ['UPCOMING', 'LIVE', 'COMPLETED', 'CANCELLED'].includes(query.status)) {
    and.push({ status: query.status as CampusEventStatus });
  }

  const events = await prisma.campusEvent.findMany({
    where: { AND: and },
    include: {
      department: { select: { id: true, name: true } },
      participants: { where: { userId }, select: { id: true } },
      interests: { where: { userId }, select: { interested: true, bookmarked: true } },
    },
    orderBy: [{ featured: 'desc' }, { startsAt: 'asc' }],
    take: 100,
  });

  // Auto-refresh derived statuses in response (lazy)
  const mapped = events.map((e) =>
    mapEvent(e, {
      joined: e.participants.length > 0,
      interested: e.interests[0]?.interested ?? false,
      bookmarked: e.interests[0]?.bookmarked ?? false,
    }),
  );

  const featured =
    mapped.find((e) => e.featured && e.status === 'UPCOMING') ??
    mapped.find((e) => e.status === 'UPCOMING' || e.status === 'LIVE') ??
    mapped[0] ??
    null;

  return { items: mapped, featured, categories: ['ALL', ...CATEGORIES] };
}

export async function getEventDetail(eventId: string, userId: string, departmentId: string) {
  const e = await prisma.campusEvent.findFirst({
    where: {
      id: eventId,
      published: true,
      status: { notIn: ['DRAFT', 'HIDDEN'] },
      AND: [visibilityWhere(departmentId)],
    },
    include: {
      department: { select: { id: true, name: true } },
      participants: {
        take: 50,
        orderBy: { joinedAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              regNo: true,
              profile: { select: { name: true, profilePhotoUrl: true } },
            },
          },
        },
      },
      interests: {
        where: { interested: true },
        take: 30,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              regNo: true,
              profile: { select: { name: true, profilePhotoUrl: true } },
            },
          },
        },
      },
    },
  });
  if (!e) throw new AppError(404, 'Event not found');

  const mine = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });
  const interest = await prisma.eventInterest.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });

  return {
    ...mapEvent(e, {
      joined: Boolean(mine),
      interested: interest?.interested ?? false,
      bookmarked: interest?.bookmarked ?? false,
    }),
    participants: e.participants.map((p) => ({
      id: p.user.id,
      regNo: p.user.regNo,
      name: p.user.profile?.name ?? p.user.regNo,
      photo: p.user.profile?.profilePhotoUrl ?? null,
      joinedAt: p.joinedAt.toISOString(),
    })),
    interestedStudents: e.interests.map((i) => ({
      id: i.user.id,
      regNo: i.user.regNo,
      name: i.user.profile?.name ?? i.user.regNo,
      photo: i.user.profile?.profilePhotoUrl ?? null,
    })),
  };
}

export async function joinEvent(eventId: string, userId: string, departmentId: string) {
  const e = await prisma.campusEvent.findFirst({
    where: {
      id: eventId,
      published: true,
      status: { in: ['UPCOMING', 'LIVE'] },
      AND: [visibilityWhere(departmentId)],
    },
  });
  if (!e) throw new AppError(404, 'Event not found or not open for registration');
  if (e.status === 'CANCELLED') throw new AppError(400, 'Event is cancelled');
  if (e.registrationDeadline && e.registrationDeadline < new Date()) {
    throw new AppError(400, 'Registration deadline has passed');
  }
  if (e.capacity != null && e.registeredCount >= e.capacity) {
    throw new AppError(400, 'Event is full');
  }

  const existing = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });
  if (existing) {
    return { joined: true, alreadyJoined: true, registeredCount: e.registeredCount };
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.eventParticipant.create({ data: { eventId, userId } });
    return tx.campusEvent.update({
      where: { id: eventId },
      data: { registeredCount: { increment: 1 } },
    });
  });

  await createNotification({
    userId,
    type: 'EVENT',
    title: 'Registration confirmed',
    body: `You joined “${e.title}”. See you there!`,
    data: { eventId, kind: 'registration_confirmed' },
  });

  return { joined: true, alreadyJoined: false, registeredCount: updated.registeredCount };
}

export async function leaveEvent(eventId: string, userId: string) {
  const existing = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });
  if (!existing) return { joined: false };

  await prisma.$transaction(async (tx) => {
    await tx.eventParticipant.delete({ where: { id: existing.id } });
    await tx.campusEvent.update({
      where: { id: eventId },
      data: { registeredCount: { decrement: 1 } },
    });
  });
  return { joined: false };
}

export async function toggleInterest(eventId: string, userId: string, departmentId: string) {
  const e = await prisma.campusEvent.findFirst({
    where: { id: eventId, published: true, AND: [visibilityWhere(departmentId)] },
  });
  if (!e) throw new AppError(404, 'Event not found');

  const row = await prisma.eventInterest.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });

  if (row?.interested) {
    await prisma.$transaction(async (tx) => {
      await tx.eventInterest.update({
        where: { id: row.id },
        data: { interested: false },
      });
      await tx.campusEvent.update({
        where: { id: eventId },
        data: { interestedCount: { decrement: 1 } },
      });
    });
    return { interested: false };
  }

  await prisma.$transaction(async (tx) => {
    if (row) {
      await tx.eventInterest.update({
        where: { id: row.id },
        data: { interested: true },
      });
    } else {
      await tx.eventInterest.create({
        data: { eventId, userId, interested: true },
      });
    }
    await tx.campusEvent.update({
      where: { id: eventId },
      data: { interestedCount: { increment: 1 } },
    });
  });
  return { interested: true };
}

export async function toggleBookmark(eventId: string, userId: string, departmentId: string) {
  const e = await prisma.campusEvent.findFirst({
    where: { id: eventId, published: true, AND: [visibilityWhere(departmentId)] },
  });
  if (!e) throw new AppError(404, 'Event not found');

  const row = await prisma.eventInterest.findUnique({
    where: { eventId_userId: { eventId, userId } },
  });
  if (row) {
    const next = !row.bookmarked;
    await prisma.eventInterest.update({
      where: { id: row.id },
      data: { bookmarked: next },
    });
    return { bookmarked: next };
  }
  await prisma.eventInterest.create({
    data: { eventId, userId, interested: false, bookmarked: true },
  });
  return { bookmarked: true };
}

export async function getUnifiedCalendar(
  userId: string,
  departmentId: string,
  from?: string,
  to?: string,
) {
  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate = to
    ? new Date(to)
    : new Date(fromDate.getFullYear(), fromDate.getMonth() + 1, 0, 23, 59, 59);

  const [campus, personal, legacy, myJoins] = await Promise.all([
    prisma.campusEvent.findMany({
      where: {
        published: true,
        status: { notIn: ['DRAFT', 'HIDDEN'] },
        startsAt: { gte: fromDate, lte: toDate },
        AND: [visibilityWhere(departmentId)],
      },
      include: {
        department: { select: { name: true } },
        _count: { select: { participants: true } },
      },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.personalEvent.findMany({
      where: { userId, startsAt: { gte: fromDate, lte: toDate } },
      orderBy: { startsAt: 'asc' },
    }),
    prisma.departmentEvent.findMany({
      where: {
        published: true,
        startsAt: { gte: fromDate, lte: toDate },
        OR: [
          { visibility: 'ALL' },
          { visibility: 'DEPARTMENT', departmentId },
          { departmentId },
        ],
      },
      include: { department: { select: { name: true } } },
    }),
    prisma.eventParticipant.findMany({
      where: { userId },
      select: { eventId: true },
    }),
  ]);

  const joinedIds = new Set(myJoins.map((j) => j.eventId));

  const items = [
    ...campus.map((e) => ({
      id: e.id,
      title: e.title,
      description: e.description?.slice(0, 200) ?? '',
      start: e.startsAt.toISOString(),
      end: e.endsAt?.toISOString() ?? null,
      venue: e.venue,
      organizer: e.organizer,
      speaker: e.speaker,
      bannerUrl: e.bannerUrl,
      type: 'campus' as const,
      category: e.category,
      color: colorForCategory(e.category),
      status: deriveStatus(e.startsAt, e.endsAt, e.status),
      department: e.department?.name ?? null,
      registeredCount: e._count.participants,
      capacity: e.capacity,
      joined: joinedIds.has(e.id),
      reminderAt: null as string | null,
    })),
    ...personal.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description ?? '',
      start: p.startsAt.toISOString(),
      end: p.endsAt?.toISOString() ?? null,
      venue: null as string | null,
      organizer: null as string | null,
      speaker: null as string | null,
      bannerUrl: null as string | null,
      type: 'personal' as const,
      category: p.type,
      color: colorForPersonalType(p.type),
      status: personalStatus(p.startsAt, p.endsAt),
      department: null as string | null,
      registeredCount: 0,
      capacity: null as number | null,
      joined: false,
      reminderAt: p.reminderAt?.toISOString() ?? null,
    })),
    ...legacy.map((e) => ({
      id: e.id,
      title: e.name,
      description: e.description?.slice(0, 200) ?? '',
      start: e.startsAt.toISOString(),
      end: e.endsAt?.toISOString() ?? null,
      venue: e.venue,
      organizer: null as string | null,
      speaker: null as string | null,
      bannerUrl: null as string | null,
      type: 'legacy' as const,
      category: 'DEPARTMENT',
      color: '#8B5CF6',
      status: 'UPCOMING' as const,
      department: e.department?.name ?? null,
      registeredCount: 0,
      capacity: null as number | null,
      joined: false,
      reminderAt: null as string | null,
    })),
  ].sort((a, b) => a.start.localeCompare(b.start));

  const upcoming = items
    .filter((i) => new Date(i.start).getTime() >= Date.now() - 60 * 60 * 1000)
    .slice(0, 12);
  const reminders = items
    .filter((i) => i.reminderAt || (i.type === 'campus' && i.joined))
    .slice(0, 8);

  return {
    items,
    upcoming,
    reminders,
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
  };
}

function colorForPersonalType(type: string): string {
  switch (type) {
    case 'ASSIGNMENT':
    case 'PROJECT':
      return '#EF4444';
    case 'MEETING':
      return '#8B5CF6';
    case 'BIRTHDAY':
      return '#EAB308';
    case 'PRACTICE':
      return '#F97316';
    case 'REMINDER':
    default:
      return '#22C55E';
  }
}

function personalStatus(startsAt: Date, endsAt: Date | null): string {
  const now = Date.now();
  const start = startsAt.getTime();
  const end = endsAt?.getTime() ?? start + 60 * 60 * 1000;
  if (now > end) return 'COMPLETED';
  if (now >= start && now <= end) return 'LIVE';
  return 'UPCOMING';
}

function colorForCategory(cat: EventCategory): string {
  switch (cat) {
    case 'COLLEGE':
      return '#2563EB';
    case 'DEPARTMENT':
      return '#8B5CF6';
    case 'EXAMS':
      return '#F97316';
    case 'HOLIDAYS':
      return '#EAB308';
    case 'WORKSHOPS':
    case 'SEMINARS':
      return '#0EA5E9';
    case 'SPORTS':
      return '#10B981';
    case 'CULTURAL':
    case 'CLUBS':
      return '#EC4899';
    case 'COMPETITIONS':
      return '#EF4444';
    default:
      return '#64748B';
  }
}

// ── Personal events ───────────────────────────────────────

export async function listPersonalEvents(userId: string, from?: string, to?: string) {
  const where: Prisma.PersonalEventWhereInput = { userId };
  if (from || to) {
    where.startsAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  return prisma.personalEvent.findMany({
    where,
    orderBy: { startsAt: 'asc' },
  });
}

function resolveReminderAt(
  startsAt: Date,
  reminderOffset?: string | null,
  reminderAt?: string | null,
): Date | null {
  if (reminderAt) {
    const d = new Date(reminderAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (!reminderOffset || reminderOffset === 'none') return null;
  const map: Record<string, number> = {
    '1d': 24 * 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
  };
  const ms = map[reminderOffset];
  if (!ms) return null;
  return new Date(startsAt.getTime() - ms);
}

export async function createPersonalEvent(
  userId: string,
  data: {
    title: string;
    description?: string;
    type?: PersonalEventType;
    startsAt: string;
    endsAt?: string;
    reminderOffset?: string | null;
    reminderAt?: string | null;
  },
) {
  if (!data.title?.trim()) throw new AppError(400, 'Title is required');
  if (!data.startsAt) throw new AppError(400, 'Date/time is required');
  const startsAt = new Date(data.startsAt);
  if (Number.isNaN(startsAt.getTime())) throw new AppError(400, 'Invalid date/time');
  const endsAt = data.endsAt ? new Date(data.endsAt) : null;
  if (endsAt && endsAt < startsAt) throw new AppError(400, 'End time must be after start');

  const reminderAt = resolveReminderAt(startsAt, data.reminderOffset, data.reminderAt);

  const row = await prisma.personalEvent.create({
    data: {
      userId,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      type: data.type ?? 'REMINDER',
      startsAt,
      endsAt,
      reminderAt,
    },
  });

  if (reminderAt && reminderAt > new Date()) {
    await createNotification({
      userId,
      type: 'EVENT',
      title: 'Reminder set',
      body: `“${row.title}” · ${reminderAt.toLocaleString()}`,
      data: { personalEventId: row.id, kind: 'personal_reminder_scheduled' },
    });
  }

  return row;
}

export async function updatePersonalEvent(
  userId: string,
  id: string,
  data: {
    title?: string;
    description?: string;
    type?: PersonalEventType;
    startsAt?: string;
    endsAt?: string | null;
    reminderOffset?: string | null;
    reminderAt?: string | null;
  },
) {
  const row = await prisma.personalEvent.findFirst({ where: { id, userId } });
  if (!row) throw new AppError(404, 'Personal event not found');

  const startsAt = data.startsAt ? new Date(data.startsAt) : row.startsAt;
  if (Number.isNaN(startsAt.getTime())) throw new AppError(400, 'Invalid date/time');

  let reminderAt = row.reminderAt;
  if (data.reminderOffset !== undefined || data.reminderAt !== undefined) {
    reminderAt = resolveReminderAt(startsAt, data.reminderOffset, data.reminderAt);
  }

  return prisma.personalEvent.update({
    where: { id },
    data: {
      title: data.title?.trim() ?? undefined,
      description:
        data.description !== undefined ? data.description?.trim() || null : undefined,
      type: data.type ?? undefined,
      startsAt: data.startsAt ? startsAt : undefined,
      endsAt:
        data.endsAt === undefined
          ? undefined
          : data.endsAt
            ? new Date(data.endsAt)
            : null,
      reminderAt,
    },
  });
}

export async function deletePersonalEvent(userId: string, id: string) {
  const row = await prisma.personalEvent.findFirst({ where: { id, userId } });
  if (!row) throw new AppError(404, 'Personal event not found');
  await prisma.personalEvent.delete({ where: { id } });
  return { message: 'Deleted' };
}

// ── Super Admin ───────────────────────────────────────────

export async function adminListEvents(query?: { search?: string; status?: string }) {
  const where: Prisma.CampusEventWhereInput = {};
  if (query?.status) where.status = query.status as CampusEventStatus;
  if (query?.search?.trim()) {
    where.OR = [
      { title: { contains: query.search.trim(), mode: 'insensitive' } },
      { organizer: { contains: query.search.trim(), mode: 'insensitive' } },
    ];
  }
  const items = await prisma.campusEvent.findMany({
    where,
    include: { department: { select: { id: true, name: true } } },
    orderBy: { startsAt: 'desc' },
    take: 200,
  });
  return items.map((e) => mapEvent(e));
}

export async function adminCreateEvent(
  data: {
    title: string;
    description?: string;
    category?: EventCategory;
    departmentId?: string | null;
    venue?: string;
    bannerUrl?: string;
    organizer?: string;
    speaker?: string;
    capacity?: number | null;
    startsAt: string;
    endsAt?: string | null;
    registrationDeadline?: string | null;
    visibility?: EventVisibility;
    status?: CampusEventStatus;
    published?: boolean;
    featured?: boolean;
    gallery?: unknown[];
    schedule?: unknown[];
  },
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  if (!data.title?.trim()) throw new AppError(400, 'Title is required');
  if (!data.startsAt) throw new AppError(400, 'Start date/time is required');

  const startsAt = new Date(data.startsAt);
  const endsAt = data.endsAt ? new Date(data.endsAt) : null;
  const status = data.status ?? deriveStatus(startsAt, endsAt, 'UPCOMING');

  const event = await prisma.campusEvent.create({
    data: {
      title: data.title.trim(),
      description: data.description?.trim() ?? '',
      category: data.category ?? 'COLLEGE',
      departmentId: data.departmentId || null,
      venue: data.venue?.trim() || null,
      bannerUrl: data.bannerUrl || null,
      organizer: data.organizer?.trim() || null,
      speaker: data.speaker?.trim() || null,
      capacity: data.capacity ?? null,
      startsAt,
      endsAt,
      registrationDeadline: data.registrationDeadline
        ? new Date(data.registrationDeadline)
        : null,
      visibility: data.visibility ?? 'ALL_STUDENTS',
      status,
      published: data.published ?? true,
      featured: data.featured ?? false,
      gallery: (data.gallery ?? []) as Prisma.InputJsonValue,
      schedule: (data.schedule ?? []) as Prisma.InputJsonValue,
      createdById: adminId,
    },
    include: { department: { select: { id: true, name: true } } },
  });

  await writeAuditLog({
    userId: adminId,
    action: 'EVENT_PUBLISHED',
    resourceType: 'campus_event',
    resourceId: event.id,
    metadata: { title: event.title },
    ...meta,
  });

  if (event.published && event.status !== 'DRAFT' && event.status !== 'HIDDEN') {
    // Notify students in scope (cap at 200 for safety)
    const users = await prisma.user.findMany({
      where: {
        role: 'STUDENT',
        deletedAt: null,
        accountStatus: 'ACTIVE',
        ...(event.visibility === 'DEPARTMENT_ONLY' && event.departmentId
          ? { departmentId: event.departmentId }
          : {}),
      },
      select: { id: true },
      take: 200,
    });
    await Promise.all(
      users.map((u) =>
        createNotification({
          userId: u.id,
          type: 'EVENT',
          title: 'New event published',
          body: event.title,
          data: { eventId: event.id, kind: 'published' },
        }),
      ),
    );
  }

  return mapEvent(event);
}

export async function adminUpdateEvent(
  id: string,
  data: Record<string, unknown>,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  const existing = await prisma.campusEvent.findUnique({ where: { id } });
  if (!existing) throw new AppError(404, 'Event not found');

  const startsAt = data.startsAt
    ? new Date(String(data.startsAt))
    : existing.startsAt;
  const endsAt =
    data.endsAt !== undefined
      ? data.endsAt
        ? new Date(String(data.endsAt))
        : null
      : existing.endsAt;

  const event = await prisma.campusEvent.update({
    where: { id },
    data: {
      ...(data.title !== undefined ? { title: String(data.title).trim() } : {}),
      ...(data.description !== undefined
        ? { description: String(data.description) }
        : {}),
      ...(data.category !== undefined
        ? { category: data.category as EventCategory }
        : {}),
      ...(data.departmentId !== undefined
        ? { departmentId: (data.departmentId as string) || null }
        : {}),
      ...(data.venue !== undefined ? { venue: (data.venue as string) || null } : {}),
      ...(data.bannerUrl !== undefined
        ? { bannerUrl: (data.bannerUrl as string) || null }
        : {}),
      ...(data.organizer !== undefined
        ? { organizer: (data.organizer as string) || null }
        : {}),
      ...(data.speaker !== undefined
        ? { speaker: (data.speaker as string) || null }
        : {}),
      ...(data.capacity !== undefined
        ? { capacity: data.capacity === null ? null : Number(data.capacity) }
        : {}),
      ...(data.startsAt !== undefined ? { startsAt } : {}),
      ...(data.endsAt !== undefined ? { endsAt } : {}),
      ...(data.registrationDeadline !== undefined
        ? {
            registrationDeadline: data.registrationDeadline
              ? new Date(String(data.registrationDeadline))
              : null,
          }
        : {}),
      ...(data.visibility !== undefined
        ? { visibility: data.visibility as EventVisibility }
        : {}),
      ...(data.status !== undefined
        ? { status: data.status as CampusEventStatus }
        : {}),
      ...(data.published !== undefined ? { published: Boolean(data.published) } : {}),
      ...(data.featured !== undefined ? { featured: Boolean(data.featured) } : {}),
      ...(data.gallery !== undefined ? { gallery: data.gallery as Prisma.InputJsonValue } : {}),
      ...(data.schedule !== undefined
        ? { schedule: data.schedule as Prisma.InputJsonValue }
        : {}),
    },
    include: { department: { select: { id: true, name: true } } },
  });

  await writeAuditLog({
    userId: adminId,
    action: 'USER_UPDATED',
    resourceType: 'campus_event',
    resourceId: id,
    metadata: { title: event.title, fields: Object.keys(data) },
    ...meta,
  });

  if (data.status === 'CANCELLED') {
    const parts = await prisma.eventParticipant.findMany({
      where: { eventId: id },
      select: { userId: true },
    });
    await Promise.all(
      parts.map((p) =>
        createNotification({
          userId: p.userId,
          type: 'EVENT',
          title: 'Event cancelled',
          body: `“${event.title}” has been cancelled.`,
          data: { eventId: id, kind: 'cancelled' },
        }),
      ),
    );
  }

  return mapEvent(event);
}

export async function adminDeleteEvent(
  id: string,
  adminId: string,
  meta: { ipAddress?: string; userAgent?: string },
) {
  await prisma.campusEvent.delete({ where: { id } });
  await writeAuditLog({
    userId: adminId,
    action: 'CONTENT_DELETED',
    resourceType: 'campus_event',
    resourceId: id,
    ...meta,
  });
  return { message: 'Event deleted' };
}

export async function adminListParticipants(eventId: string) {
  const e = await prisma.campusEvent.findUnique({ where: { id: eventId } });
  if (!e) throw new AppError(404, 'Event not found');
  const rows = await prisma.eventParticipant.findMany({
    where: { eventId },
    orderBy: { joinedAt: 'asc' },
    include: {
      user: {
        select: {
          id: true,
          regNo: true,
          email: true,
          profile: { select: { name: true, year: true, section: true } },
          department: { select: { name: true } },
        },
      },
    },
  });
  return {
    event: { id: e.id, title: e.title, registeredCount: e.registeredCount },
    participants: rows.map((r) => ({
      id: r.user.id,
      regNo: r.user.regNo,
      email: r.user.email,
      name: r.user.profile?.name ?? r.user.regNo,
      year: r.user.profile?.year,
      section: r.user.profile?.section,
      department: r.user.department.name,
      joinedAt: r.joinedAt.toISOString(),
    })),
  };
}

export async function exportParticipantsCsv(eventId: string): Promise<string> {
  const data = await adminListParticipants(eventId);
  const header = 'regNo,name,email,department,year,section,joinedAt';
  const lines = data.participants.map((p) =>
    [
      p.regNo,
      csvEscape(p.name),
      p.email,
      csvEscape(p.department),
      p.year ?? '',
      p.section ?? '',
      p.joinedAt,
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

function csvEscape(v: string) {
  if (v.includes(',') || v.includes('"')) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Process due reminders (call from cron / admin trigger). */
export async function processEventReminders() {
  const now = Date.now();
  const windows = [
    { label: '1 day', ms: 24 * 60 * 60 * 1000, kind: 'reminder_1d' },
    { label: '2 hours', ms: 2 * 60 * 60 * 1000, kind: 'reminder_2h' },
    { label: '30 minutes', ms: 30 * 60 * 1000, kind: 'reminder_30m' },
  ];

  let sent = 0;
  const events = await prisma.campusEvent.findMany({
    where: {
      published: true,
      status: { in: ['UPCOMING', 'LIVE'] },
      startsAt: { gte: new Date(), lte: new Date(now + 25 * 60 * 60 * 1000) },
    },
    include: { participants: { select: { userId: true } } },
  });

  for (const e of events) {
    const delta = e.startsAt.getTime() - now;
    for (const w of windows) {
      // Fire when within ±7.5 min of the reminder offset (for periodic jobs)
      if (Math.abs(delta - w.ms) > 7.5 * 60 * 1000) continue;
      for (const p of e.participants) {
        await createNotification({
          userId: p.userId,
          type: 'EVENT',
          title: `Reminder · ${w.label}`,
          body: `“${e.title}” starts soon.`,
          data: { eventId: e.id, kind: w.kind },
        });
        sent += 1;
      }
    }
  }

  // Personal event reminders due now (±7.5 min window)
  const windowStart = new Date(now - 7.5 * 60 * 1000);
  const windowEnd = new Date(now + 7.5 * 60 * 1000);
  const personalDue = await prisma.personalEvent.findMany({
    where: {
      reminderAt: { gte: windowStart, lte: windowEnd },
    },
  });
  for (const p of personalDue) {
    await createNotification({
      userId: p.userId,
      type: 'EVENT',
      title: 'Personal reminder',
      body: `“${p.title}” is coming up.`,
      data: { personalEventId: p.id, kind: 'personal_reminder' },
    });
    sent += 1;
  }

  return { sent };
}
