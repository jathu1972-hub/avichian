import {
  FriendRequestStatus,
  SkillMatchRequestStatus,
  SkillMatchVisibility,
  SkillProficiency,
  type Prisma,
} from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { emitToUser } from '../socket.js';
import {
  areFriends,
  getBlockedPeerIds,
  getFriendIds,
  isBlockedEitherWay,
  sendFriendRequest,
} from './friends.service.js';
import {
  calculateSkillMatch,
  relevanceScore,
  yearLabel,
  type MatchProfileSnap,
  type MatchReason,
} from './skill-match.algorithm.js';

export const MAX_SKILLS = 10;
export const MAX_SKILL_CATEGORIES = 5;
export const MAX_INTERESTS = 15;

const ACTIVATED: Prisma.UserWhereInput = {
  role: { in: ['STUDENT', 'STAFF'] },
  deletedAt: null,
  accountStatus: 'ACTIVE',
  lastLoginAt: { not: null },
  forcePasswordChange: false,
};

const profileInclude = {
  skill: { include: { category: true } },
} as const;

type LoadedUser = {
  id: string;
  regNo: string;
  online: boolean;
  lastSeen: Date | null;
  lastLoginAt: Date | null;
  deletedAt: Date | null;
  accountStatus: string;
  forcePasswordChange: boolean;
  departmentId: string;
  department: { id: string; name: string };
  profile: {
    name: string;
    bio: string | null;
    year: number | null;
    profilePhotoUrl: string | null;
  } | null;
  skillMatchProfile: { visibility: SkillMatchVisibility } | null;
  studentSkills: Array<{
    proficiency: SkillProficiency;
    skill: {
      id: string;
      name: string;
      category: { id: string; slug: string; name: string };
    };
  }>;
  skillInterests: Array<{
    skill: {
      id: string;
      name: string;
      category: { id: string; slug: string; name: string };
    };
  }>;
  skillGoals: Array<{ goal: { id: string; slug: string; label: string } }>;
  skillAvailabilities: Array<{ avail: { id: string; slug: string; label: string } }>;
  settings: { whoCanCall: string; whoCanMessage: string } | null;
};

const userSkillInclude = {
  profile: true,
  department: true,
  skillMatchProfile: true,
  settings: { select: { whoCanCall: true, whoCanMessage: true } },
  studentSkills: { include: profileInclude, orderBy: { skill: { sortOrder: 'asc' as const } } },
  skillInterests: { include: profileInclude, orderBy: { skill: { sortOrder: 'asc' as const } } },
  skillGoals: { include: { goal: true }, orderBy: { goal: { sortOrder: 'asc' as const } } },
  skillAvailabilities: {
    include: { avail: true },
    orderBy: { avail: { sortOrder: 'asc' as const } },
  },
} satisfies Prisma.UserInclude;

export type ConnectionState =
  | 'connect'
  | 'request_sent'
  | 'request_received'
  | 'connected'
  | 'blocked'
  | 'unavailable';

function toSnap(user: LoadedUser): MatchProfileSnap {
  return {
    skills: user.studentSkills.map((s) => ({
      id: s.skill.id,
      name: s.skill.name,
      categorySlug: s.skill.category.slug,
      proficiency: s.proficiency,
    })),
    interests: user.skillInterests.map((s) => ({
      id: s.skill.id,
      name: s.skill.name,
      categorySlug: s.skill.category.slug,
    })),
    goals: user.skillGoals.map((g) => ({ slug: g.goal.slug, label: g.goal.label })),
    availabilities: user.skillAvailabilities.map((a) => ({
      slug: a.avail.slug,
      label: a.avail.label,
    })),
    departmentId: user.departmentId,
    departmentName: user.department.name,
    year: user.profile?.year ?? null,
  };
}

function groupedSkills(user: LoadedUser) {
  const groups = new Map<
    string,
    { categoryId: string; categorySlug: string; categoryName: string; skills: Array<{
      id: string;
      name: string;
      proficiency: SkillProficiency;
    }> }
  >();
  for (const row of user.studentSkills) {
    const key = row.skill.category.id;
    if (!groups.has(key)) {
      groups.set(key, {
        categoryId: row.skill.category.id,
        categorySlug: row.skill.category.slug,
        categoryName: row.skill.category.name,
        skills: [],
      });
    }
    groups.get(key)!.skills.push({
      id: row.skill.id,
      name: row.skill.name,
      proficiency: row.proficiency,
    });
  }
  return [...groups.values()];
}

function publicCard(
  user: LoadedUser,
  match: ReturnType<typeof calculateSkillMatch> | null,
  connectionState: ConnectionState,
  requestId: string | null,
  opts?: { isSelf?: boolean },
) {
  const canMessage = connectionState === 'connected';
  const callSetting = user.settings?.whoCanCall ?? 'FRIENDS';
  const canCall = canMessage && callSetting !== 'NOBODY';
  return {
    id: user.id,
    name: user.profile?.name ?? user.regNo,
    regNo: user.regNo,
    department: user.department.name,
    year: user.profile?.year ?? null,
    yearLabel: yearLabel(user.profile?.year),
    bio: user.profile?.bio ?? null,
    profilePhotoUrl: user.profile?.profilePhotoUrl ?? null,
    online: user.online,
    lastActiveAt: (user.lastSeen ?? user.lastLoginAt)?.toISOString() ?? null,
    visibility: user.skillMatchProfile?.visibility ?? 'CAMPUS',
    isSelf: Boolean(opts?.isSelf),
    skills: groupedSkills(user),
    interests: user.skillInterests.map((s) => ({
      id: s.skill.id,
      name: s.skill.name,
      categoryName: s.skill.category.name,
    })),
    goals: user.skillGoals.map((g) => ({ id: g.goal.id, slug: g.goal.slug, label: g.goal.label })),
    availabilities: user.skillAvailabilities.map((a) => ({
      id: a.avail.id,
      slug: a.avail.slug,
      label: a.avail.label,
    })),
    matchScore: match?.score ?? null,
    youHelpThem: match?.youHelpThem ?? [],
    theyHelpYou: match?.theyHelpYou ?? [],
    sharedGoals: match?.sharedGoals ?? [],
    reasons: (match?.reasons ?? []) as MatchReason[],
    connectionState,
    requestId,
    canMessage,
    canCall,
  };
}

function hasDiscoverableContent(user: LoadedUser): boolean {
  return (
    user.studentSkills.length > 0 ||
    user.skillInterests.length > 0 ||
    user.skillGoals.length > 0
  );
}

async function loadUser(userId: string): Promise<LoadedUser | null> {
  return prisma.user.findFirst({
    where: { id: userId },
    include: userSkillInclude,
  }) as Promise<LoadedUser | null>;
}

async function requireActivated(userId: string): Promise<LoadedUser> {
  const user = await prisma.user.findFirst({
    where: { id: userId, ...ACTIVATED },
    include: userSkillInclude,
  });
  if (!user) {
    throw new AppError(404, 'Student not found or has not activated AVICHIAN yet');
  }
  return user as LoadedUser;
}

export async function getCatalog() {
  const { ensureSkillCatalog } = await import('./skill-catalog.seed.js');
  await ensureSkillCatalog();
  const [categories, goals, availabilities, departments] = await Promise.all([
    prisma.skillCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { skills: { orderBy: { sortOrder: 'asc' } } },
    }),
    prisma.skillGoalCatalog.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.skillAvailabilityCatalog.findMany({ orderBy: { sortOrder: 'asc' } }),
    prisma.department.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ]);
  return {
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      skills: c.skills.map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
    })),
    goals: goals.map((g) => ({ id: g.id, slug: g.slug, label: g.label })),
    availabilities: availabilities.map((a) => ({ id: a.id, slug: a.slug, label: a.label })),
    departments,
    years: [1, 2, 3, 4],
    limits: {
      maxSkills: MAX_SKILLS,
      maxCategories: MAX_SKILL_CATEGORIES,
      maxInterests: MAX_INTERESTS,
    },
  };
}

export async function getMySkillMatch(userId: string) {
  const user = await requireActivated(userId);
  return {
    ...publicCard(user, null, 'connected', null, { isSelf: true }),
    visibility: user.skillMatchProfile?.visibility ?? 'CAMPUS',
    ready: hasDiscoverableContent(user),
  };
}

export async function saveMySkillMatch(
  userId: string,
  input: {
    skills?: Array<{ skillId: string; proficiency: SkillProficiency }>;
    interestIds?: string[];
    goalIds?: string[];
    availabilityIds?: string[];
    visibility?: SkillMatchVisibility;
  },
) {
  await requireActivated(userId);

  if (input.skills) {
    if (input.skills.length > MAX_SKILLS) {
      throw new AppError(400, `Choose up to ${MAX_SKILLS} skills`);
    }
    const unique = new Set(input.skills.map((s) => s.skillId));
    if (unique.size !== input.skills.length) {
      throw new AppError(400, 'Duplicate skills are not allowed');
    }
    const catalogSkills = await prisma.skill.findMany({
      where: { id: { in: input.skills.map((s) => s.skillId) } },
      select: { id: true, categoryId: true },
    });
    if (catalogSkills.length !== input.skills.length) {
      throw new AppError(400, 'One or more skills are invalid');
    }
    const categoryCount = new Set(catalogSkills.map((s) => s.categoryId)).size;
    if (categoryCount > MAX_SKILL_CATEGORIES) {
      throw new AppError(400, `Skills can span at most ${MAX_SKILL_CATEGORIES} categories`);
    }
  }

  if (input.interestIds && input.interestIds.length > MAX_INTERESTS) {
    throw new AppError(400, `Choose up to ${MAX_INTERESTS} interests`);
  }

  const skillIds = input.skills?.map((s) => s.skillId) ?? [];
  const interestIds = input.interestIds ?? [];
  const overlap = skillIds.filter((id) => interestIds.includes(id));
  // Allowed — a student can know Photoshop and still want to learn more Photoshop.
  void overlap;

  if (input.interestIds) {
    const found = await prisma.skill.count({ where: { id: { in: input.interestIds } } });
    if (found !== input.interestIds.length) {
      throw new AppError(400, 'One or more interests are invalid');
    }
  }
  if (input.goalIds) {
    const found = await prisma.skillGoalCatalog.count({ where: { id: { in: input.goalIds } } });
    if (found !== input.goalIds.length) {
      throw new AppError(400, 'One or more goals are invalid');
    }
  }
  if (input.availabilityIds) {
    const found = await prisma.skillAvailabilityCatalog.count({
      where: { id: { in: input.availabilityIds } },
    });
    if (found !== input.availabilityIds.length) {
      throw new AppError(400, 'One or more availability options are invalid');
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.skillMatchProfile.upsert({
      where: { userId },
      create: {
        userId,
        visibility: input.visibility ?? 'CAMPUS',
      },
      update: input.visibility ? { visibility: input.visibility } : {},
    });

    if (input.skills) {
      await tx.studentSkill.deleteMany({ where: { userId } });
      if (input.skills.length) {
        await tx.studentSkill.createMany({
          data: input.skills.map((s) => ({
            userId,
            skillId: s.skillId,
            proficiency: s.proficiency,
          })),
        });
      }
    }

    if (input.interestIds) {
      await tx.skillInterest.deleteMany({ where: { userId } });
      if (input.interestIds.length) {
        await tx.skillInterest.createMany({
          data: input.interestIds.map((skillId) => ({ userId, skillId })),
        });
      }
    }

    if (input.goalIds) {
      await tx.studentGoal.deleteMany({ where: { userId } });
      if (input.goalIds.length) {
        await tx.studentGoal.createMany({
          data: input.goalIds.map((goalId) => ({ userId, goalId })),
        });
      }
    }

    if (input.availabilityIds) {
      await tx.studentAvailability.deleteMany({ where: { userId } });
      if (input.availabilityIds.length) {
        await tx.studentAvailability.createMany({
          data: input.availabilityIds.map((availId) => ({ userId, availId })),
        });
      }
    }
  });

  return getMySkillMatch(userId);
}

type RelationMaps = {
  friendIds: Set<string>;
  blockedIds: Set<string>;
  skillOutgoing: Map<string, { id: string; status: SkillMatchRequestStatus }>;
  skillIncoming: Map<string, { id: string; status: SkillMatchRequestStatus }>;
  friendOutgoing: Set<string>;
  friendIncoming: Set<string>;
};

async function loadRelations(viewerId: string): Promise<RelationMaps> {
  const [friendIds, blockedIds, skillSent, skillRecv, friendSent, friendRecv] = await Promise.all([
    getFriendIds(viewerId),
    getBlockedPeerIds(viewerId),
    prisma.skillMatchRequest.findMany({
      where: { senderId: viewerId },
      select: { id: true, receiverId: true, status: true },
    }),
    prisma.skillMatchRequest.findMany({
      where: { receiverId: viewerId },
      select: { id: true, senderId: true, status: true },
    }),
    prisma.friendRequest.findMany({
      where: { senderId: viewerId, status: FriendRequestStatus.PENDING },
      select: { receiverId: true },
    }),
    prisma.friendRequest.findMany({
      where: { receiverId: viewerId, status: FriendRequestStatus.PENDING },
      select: { senderId: true },
    }),
  ]);

  return {
    friendIds: new Set(friendIds),
    blockedIds: new Set(blockedIds),
    skillOutgoing: new Map(skillSent.map((r) => [r.receiverId, { id: r.id, status: r.status }])),
    skillIncoming: new Map(skillRecv.map((r) => [r.senderId, { id: r.id, status: r.status }])),
    friendOutgoing: new Set(friendSent.map((r) => r.receiverId)),
    friendIncoming: new Set(friendRecv.map((r) => r.senderId)),
  };
}

function resolveConnection(
  otherId: string,
  rel: RelationMaps,
): { state: ConnectionState; requestId: string | null } {
  if (rel.blockedIds.has(otherId)) {
    return { state: 'blocked', requestId: null };
  }
  const out = rel.skillOutgoing.get(otherId);
  const inn = rel.skillIncoming.get(otherId);
  if (out?.status === 'ACCEPTED' || inn?.status === 'ACCEPTED' || rel.friendIds.has(otherId)) {
    return { state: 'connected', requestId: out?.id ?? inn?.id ?? null };
  }
  if (out?.status === 'PENDING') {
    return { state: 'request_sent', requestId: out.id };
  }
  if (inn?.status === 'PENDING') {
    return { state: 'request_received', requestId: inn.id };
  }
  if (rel.friendOutgoing.has(otherId)) {
    return { state: 'request_sent', requestId: null };
  }
  if (rel.friendIncoming.has(otherId)) {
    return { state: 'request_received', requestId: null };
  }
  return { state: 'connect', requestId: null };
}

function canViewerSee(other: LoadedUser, viewerId: string, rel: RelationMaps): boolean {
  if (other.id === viewerId) return true;
  if (rel.blockedIds.has(other.id)) return false;
  const visibility = other.skillMatchProfile?.visibility ?? 'CAMPUS';
  if (visibility === 'HIDDEN') return false;
  if (visibility === 'CONNECTED') {
    const out = rel.skillOutgoing.get(other.id);
    const inn = rel.skillIncoming.get(other.id);
    return (
      rel.friendIds.has(other.id) ||
      out?.status === 'ACCEPTED' ||
      inn?.status === 'ACCEPTED'
    );
  }
  return true;
}

export async function discoverMatches(
  viewerId: string,
  query: {
    q?: string;
    skillId?: string;
    categoryId?: string;
    departmentId?: string;
    year?: number;
    goalId?: string;
    availabilityId?: string;
    sort?: 'best' | 'relevant' | 'recent';
    cursor?: string;
    limit?: number;
  },
) {
  const viewer = await requireActivated(viewerId);
  const rel = await loadRelations(viewerId);
  const limit = Math.min(Math.max(query.limit ?? 12, 1), 24);
  const offset = query.cursor ? Math.max(0, Number.parseInt(query.cursor, 10) || 0) : 0;
  const sort = query.sort ?? 'best';
  const q = query.q?.trim() ?? '';

  const where: Prisma.UserWhereInput = {
    ...ACTIVATED,
    id: { notIn: [viewerId, ...rel.blockedIds] },
    skillMatchProfile: {
      is: {
        visibility: { in: ['CAMPUS', 'CONNECTED'] },
      },
    },
    OR: [
      { studentSkills: { some: {} } },
      { skillInterests: { some: {} } },
      { skillGoals: { some: {} } },
    ],
  };

  if (query.departmentId) {
    where.departmentId = query.departmentId;
  }
  if (query.year) {
    where.profile = { ...(where.profile as object), year: query.year };
  }
  if (query.skillId) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { studentSkills: { some: { skillId: query.skillId } } },
          { skillInterests: { some: { skillId: query.skillId } } },
        ],
      },
    ];
  }
  if (query.categoryId) {
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { studentSkills: { some: { skill: { categoryId: query.categoryId } } } },
          { skillInterests: { some: { skill: { categoryId: query.categoryId } } } },
        ],
      },
    ];
  }
  if (query.goalId) {
    where.skillGoals = { some: { goalId: query.goalId } };
  }
  if (query.availabilityId) {
    where.skillAvailabilities = { some: { availId: query.availabilityId } };
  }
  if (q) {
    const yearFromQ = Number(q);
    where.AND = [
      ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
      {
        OR: [
          { regNo: { contains: q, mode: 'insensitive' } },
          { profile: { name: { contains: q, mode: 'insensitive' } } },
          { department: { name: { contains: q, mode: 'insensitive' } } },
          { studentSkills: { some: { skill: { name: { contains: q, mode: 'insensitive' } } } } },
          { skillInterests: { some: { skill: { name: { contains: q, mode: 'insensitive' } } } } },
          { skillGoals: { some: { goal: { label: { contains: q, mode: 'insensitive' } } } } },
          ...(yearFromQ > 0 && yearFromQ < 10 ? [{ profile: { year: yearFromQ } }] : []),
        ],
      },
    ];
  }

  const pool = (await prisma.user.findMany({
    where,
    include: userSkillInclude,
    take: 180,
    orderBy: { lastSeen: 'desc' },
  })) as LoadedUser[];

  const viewerSnap = toSnap(viewer);
  const scored = pool
    .filter((u) => canViewerSee(u, viewerId, rel) && hasDiscoverableContent(u))
    .map((u) => {
      const match = calculateSkillMatch(viewerSnap, toSnap(u));
      const conn = resolveConnection(u.id, rel);
      const lastActive = u.lastSeen ?? u.lastLoginAt;
      return {
        user: u,
        match,
        conn,
        lastActive,
        rank:
          sort === 'recent'
            ? (lastActive?.getTime() ?? 0)
            : sort === 'relevant'
              ? relevanceScore(match.score, lastActive)
              : match.score * 1_000_000 + (lastActive?.getTime() ?? 0) / 1e12,
      };
    })
    .sort((a, b) => b.rank - a.rank);

  const page = scored.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const hasMore = nextOffset < scored.length;

  return {
    items: page.map((row) =>
      publicCard(row.user, row.match, row.conn.state, row.conn.requestId),
    ),
    nextCursor: hasMore ? String(nextOffset) : null,
    hasMore,
    viewerReady: hasDiscoverableContent(viewer),
    total: scored.length,
  };
}

export async function getMatchProfile(viewerId: string, targetId: string) {
  if (viewerId === targetId) {
    return getMySkillMatch(viewerId);
  }
  const [viewer, target, rel] = await Promise.all([
    requireActivated(viewerId),
    loadUser(targetId),
    loadRelations(viewerId),
  ]);
  if (!target || target.deletedAt) {
    throw new AppError(404, 'Student not found');
  }
  if (
    target.accountStatus !== 'ACTIVE' ||
    !target.lastLoginAt ||
    target.forcePasswordChange
  ) {
    throw new AppError(404, 'Student is not available on Skill Match');
  }
  if (rel.blockedIds.has(target.id)) {
    throw new AppError(403, 'This student is blocked');
  }
  if (!canViewerSee(target, viewerId, rel)) {
    throw new AppError(404, 'This Skill Match profile is hidden');
  }
  if (!hasDiscoverableContent(target)) {
    throw new AppError(404, 'This student has not set up Skill Match yet');
  }

  const match = calculateSkillMatch(toSnap(viewer), toSnap(target));
  const conn = resolveConnection(target.id, rel);
  return publicCard(target, match, conn.state, conn.requestId);
}

async function deleteSkillMatchNotifications(userId: string, requestId: string) {
  const rows = await prisma.notification.findMany({
    where: {
      userId,
      type: { in: ['SKILL_MATCH_REQUEST', 'SKILL_MATCH_ACCEPTED'] },
    },
    select: { id: true, data: true },
  });
  const ids = rows
    .filter((r) => {
      const d = r.data as { requestId?: string } | null;
      return d?.requestId === requestId;
    })
    .map((r) => r.id);
  if (!ids.length) return;
  await prisma.notification.deleteMany({ where: { id: { in: ids } } });
  for (const id of ids) {
    emitToUser(userId, 'notification:deleted', { id });
  }
}

async function ensureAcceptedFriendship(a: string, b: string) {
  const existing = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId: a, receiverId: b } },
  });
  const reverse = await prisma.friendRequest.findUnique({
    where: { senderId_receiverId: { senderId: b, receiverId: a } },
  });
  if (existing?.status === FriendRequestStatus.ACCEPTED) return;
  if (reverse?.status === FriendRequestStatus.ACCEPTED) return;

  if (existing && existing.status !== FriendRequestStatus.BLOCKED) {
    await prisma.friendRequest.update({
      where: { id: existing.id },
      data: { status: FriendRequestStatus.ACCEPTED, acceptedAt: new Date() },
    });
    if (reverse && reverse.status !== FriendRequestStatus.BLOCKED) {
      await prisma.friendRequest.update({
        where: { id: reverse.id },
        data: { status: FriendRequestStatus.CANCELLED },
      });
    }
    return;
  }
  if (reverse && reverse.status !== FriendRequestStatus.BLOCKED) {
    await prisma.friendRequest.update({
      where: { id: reverse.id },
      data: { status: FriendRequestStatus.ACCEPTED, acceptedAt: new Date() },
    });
    return;
  }
  if (!existing && !reverse) {
    await prisma.friendRequest.create({
      data: {
        senderId: a,
        receiverId: b,
        status: FriendRequestStatus.ACCEPTED,
        acceptedAt: new Date(),
      },
    });
  }
}

async function trySendFriendRequest(senderId: string, receiverId: string) {
  try {
    await sendFriendRequest(senderId, receiverId);
  } catch (err) {
    if (err instanceof AppError && (err.statusCode === 409 || err.statusCode === 403)) {
      return;
    }
    throw err;
  }
}

export async function sendSkillConnect(senderId: string, receiverId: string) {
  if (senderId === receiverId) {
    throw new AppError(400, 'You cannot connect with yourself');
  }
  const [sender, receiver] = await Promise.all([
    requireActivated(senderId),
    requireActivated(receiverId),
  ]);
  if (await isBlockedEitherWay(senderId, receiverId)) {
    throw new AppError(403, 'Cannot connect — user is blocked');
  }
  const rel = await loadRelations(senderId);
  if (!canViewerSee(receiver, senderId, rel)) {
    throw new AppError(404, 'This Skill Match profile is hidden');
  }
  if (!hasDiscoverableContent(receiver)) {
    throw new AppError(400, 'This student has not set up Skill Match yet');
  }

  const match = calculateSkillMatch(toSnap(sender), toSnap(receiver));
  const reasons = match.reasons as unknown as Prisma.InputJsonValue;

  const existing = await prisma.skillMatchRequest.findUnique({
    where: { senderId_receiverId: { senderId, receiverId } },
  });
  const reverse = await prisma.skillMatchRequest.findUnique({
    where: { senderId_receiverId: { senderId: receiverId, receiverId: senderId } },
  });

  if (existing?.status === 'ACCEPTED' || reverse?.status === 'ACCEPTED') {
    throw new AppError(409, 'Already connected');
  }
  if (await areFriends(senderId, receiverId)) {
    const row =
      existing ??
      (await prisma.skillMatchRequest.create({
        data: {
          senderId,
          receiverId,
          status: 'ACCEPTED',
          matchScore: match.score,
          reasons,
        },
      }));
    if (existing) {
      await prisma.skillMatchRequest.update({
        where: { id: existing.id },
        data: { status: 'ACCEPTED', matchScore: match.score, reasons },
      });
    }
    return {
      ...publicCard(receiver, match, 'connected', row.id),
      alreadyFriends: true,
    };
  }

  if (reverse?.status === 'PENDING') {
    return acceptSkillConnect(senderId, reverse.id);
  }

  if (existing?.status === 'PENDING') {
    throw new AppError(409, 'Connection request already sent');
  }

  const row = existing
    ? await prisma.skillMatchRequest.update({
        where: { id: existing.id },
        data: { status: 'PENDING', matchScore: match.score, reasons },
      })
    : await prisma.skillMatchRequest.create({
        data: {
          senderId,
          receiverId,
          status: 'PENDING',
          matchScore: match.score,
          reasons,
        },
      });

  await trySendFriendRequest(senderId, receiverId);

  const { createNotification } = await import('./notification.service.js');
  const senderName = sender.profile?.name ?? sender.regNo;
  await createNotification({
    userId: receiverId,
    type: 'SKILL_MATCH_REQUEST',
    title: 'Skill Match request',
    body: `${senderName} wants to connect · ${match.score}% match`,
    data: { userId: senderId, requestId: row.id, matchScore: match.score },
  });
  emitToUser(receiverId, 'skill-match:request', {
    requestId: row.id,
    fromUserId: senderId,
    fromName: senderName,
    matchScore: match.score,
  });

  return publicCard(receiver, match, 'request_sent', row.id);
}

export async function acceptSkillConnect(userId: string, requestId: string) {
  const request = await prisma.skillMatchRequest.findUnique({ where: { id: requestId } });
  if (!request || request.receiverId !== userId) {
    throw new AppError(404, 'Connection request not found');
  }
  if (request.status !== 'PENDING') {
    throw new AppError(400, 'This request is no longer pending');
  }
  if (await isBlockedEitherWay(request.senderId, request.receiverId)) {
    throw new AppError(403, 'Cannot connect — user is blocked');
  }

  const [viewer, sender] = await Promise.all([
    requireActivated(userId),
    requireActivated(request.senderId),
  ]);
  const match = calculateSkillMatch(toSnap(viewer), toSnap(sender));

  const updated = await prisma.skillMatchRequest.update({
    where: { id: requestId },
    data: {
      status: 'ACCEPTED',
      matchScore: match.score,
      reasons: match.reasons as unknown as Prisma.InputJsonValue,
    },
  });

  await ensureAcceptedFriendship(request.senderId, request.receiverId);
  await deleteSkillMatchNotifications(userId, requestId);

  const { createNotification } = await import('./notification.service.js');
  const accepterName = viewer.profile?.name ?? viewer.regNo;
  await createNotification({
    userId: request.senderId,
    type: 'SKILL_MATCH_ACCEPTED',
    title: 'Skill Match connected',
    body: `${accepterName} accepted · ${match.score}% match`,
    data: { userId, requestId, matchScore: match.score },
  });

  emitToUser(request.senderId, 'skill-match:accept', {
    requestId,
    userId,
    name: accepterName,
    matchScore: match.score,
  });
  emitToUser(userId, 'skill-match:accept', {
    requestId,
    userId: request.senderId,
    name: sender.profile?.name ?? sender.regNo,
    matchScore: match.score,
  });
  emitToUser(request.senderId, 'friend:accept', {
    requestId,
    userId,
    name: accepterName,
  });

  return publicCard(sender, match, 'connected', updated.id);
}

export async function declineSkillConnect(userId: string, requestId: string) {
  const request = await prisma.skillMatchRequest.findUnique({ where: { id: requestId } });
  if (!request || request.receiverId !== userId) {
    throw new AppError(404, 'Connection request not found');
  }
  if (request.status !== 'PENDING') {
    throw new AppError(400, 'This request is no longer pending');
  }
  await prisma.skillMatchRequest.update({
    where: { id: requestId },
    data: { status: 'DECLINED' },
  });
  await deleteSkillMatchNotifications(userId, requestId);

  const pendingFriend = await prisma.friendRequest.findFirst({
    where: {
      senderId: request.senderId,
      receiverId: userId,
      status: FriendRequestStatus.PENDING,
    },
  });
  if (pendingFriend) {
    await prisma.friendRequest.update({
      where: { id: pendingFriend.id },
      data: { status: FriendRequestStatus.REJECTED },
    });
  }

  emitToUser(request.senderId, 'skill-match:decline', { requestId, userId });
  return { ok: true };
}

export async function cancelSkillConnect(userId: string, requestId: string) {
  const request = await prisma.skillMatchRequest.findUnique({ where: { id: requestId } });
  if (!request || request.senderId !== userId) {
    throw new AppError(404, 'Connection request not found');
  }
  if (request.status !== 'PENDING') {
    throw new AppError(400, 'This request is no longer pending');
  }
  await prisma.skillMatchRequest.update({
    where: { id: requestId },
    data: { status: 'CANCELLED' },
  });
  await deleteSkillMatchNotifications(request.receiverId, requestId);

  const pendingFriend = await prisma.friendRequest.findFirst({
    where: {
      senderId: userId,
      receiverId: request.receiverId,
      status: FriendRequestStatus.PENDING,
    },
  });
  if (pendingFriend) {
    await prisma.friendRequest.update({
      where: { id: pendingFriend.id },
      data: { status: FriendRequestStatus.CANCELLED },
    });
  }

  emitToUser(request.receiverId, 'skill-match:cancel', { requestId, userId });
  return { ok: true };
}

export async function listSkillRequests(userId: string) {
  const [incoming, outgoing] = await Promise.all([
    prisma.skillMatchRequest.findMany({
      where: { receiverId: userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.skillMatchRequest.findMany({
      where: { senderId: userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const viewer = await requireActivated(userId);
  const incomingUsers = await prisma.user.findMany({
    where: { id: { in: incoming.map((r) => r.senderId) }, ...ACTIVATED },
    include: userSkillInclude,
  });
  const outgoingUsers = await prisma.user.findMany({
    where: { id: { in: outgoing.map((r) => r.receiverId) }, ...ACTIVATED },
    include: userSkillInclude,
  });
  const inMap = new Map(incomingUsers.map((u) => [u.id, u as LoadedUser]));
  const outMap = new Map(outgoingUsers.map((u) => [u.id, u as LoadedUser]));
  const viewerSnap = toSnap(viewer);

  return {
    incoming: incoming
      .map((r) => {
        const u = inMap.get(r.senderId);
        if (!u) return null;
        const match = calculateSkillMatch(viewerSnap, toSnap(u));
        return publicCard(u, match, 'request_received', r.id);
      })
      .filter(Boolean),
    outgoing: outgoing
      .map((r) => {
        const u = outMap.get(r.receiverId);
        if (!u) return null;
        const match = calculateSkillMatch(viewerSnap, toSnap(u));
        return publicCard(u, match, 'request_sent', r.id);
      })
      .filter(Boolean),
  };
}
