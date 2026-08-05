import type {
  CommunityAccess,
  CommunityCategory,
  CommunityMemberRole,
  CommunityStatus,
  CommunityVisibility,
  Prisma,
} from '@prisma/client';
import { sanitizeText } from '@avichian/shared';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../utils/errors.js';
import { writeAuditLog } from './audit.service.js';

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base || `community-${Date.now().toString(36)}`;
}

async function uniqueSlug(name: string, excludeId?: string): Promise<string> {
  let slug = slugify(name);
  let n = 0;
  for (;;) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const existing = await prisma.community.findUnique({ where: { slug: candidate } });
    if (!existing || existing.id === excludeId) return candidate;
    n += 1;
  }
}

const memberUserSelect = {
  id: true,
  regNo: true,
  profile: { select: { name: true, profilePhotoUrl: true } },
} as const;

function mapMember(m: {
  id: string;
  role: CommunityMemberRole;
  joinedAt: Date;
  user: {
    id: string;
    regNo: string;
    profile: { name: string; profilePhotoUrl: string | null } | null;
  };
}) {
  return {
    id: m.id,
    role: m.role,
    joinedAt: m.joinedAt.toISOString(),
    user: {
      id: m.user.id,
      regNo: m.user.regNo,
      name: m.user.profile?.name ?? m.user.regNo,
      profilePhotoUrl: m.user.profile?.profilePhotoUrl ?? null,
    },
  };
}

function mapCommunity(
  c: {
    id: string;
    name: string;
    slug: string;
    description: string;
    category: CommunityCategory;
    departmentId: string | null;
    bannerUrl: string | null;
    iconUrl: string | null;
    visibility: CommunityVisibility;
    accessType: CommunityAccess;
    status: CommunityStatus;
    rules: string | null;
    tags: string[];
    chatEnabled: boolean;
    featured: boolean;
    memberCount: number;
    postCount: number;
    createdById: string;
    createdAt: Date;
    updatedAt: Date;
    department?: { id: string; name: string } | null;
    members?: Array<{
      id: string;
      role: CommunityMemberRole;
      joinedAt: Date;
      user: {
        id: string;
        regNo: string;
        profile: { name: string; profilePhotoUrl: string | null } | null;
      };
    }>;
    _count?: { members: number; posts: number };
  },
  opts?: { joined?: boolean; myRole?: CommunityMemberRole | null },
) {
  const moderators =
    c.members
      ?.filter((m) => m.role === 'MODERATOR' || m.role === 'ADMIN')
      .map(mapMember) ?? [];

  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    category: c.category,
    departmentId: c.departmentId,
    department: c.department?.name ?? null,
    bannerUrl: c.bannerUrl,
    iconUrl: c.iconUrl,
    visibility: c.visibility,
    accessType: c.accessType,
    status: c.status,
    rules: c.rules,
    tags: c.tags,
    chatEnabled: c.chatEnabled,
    featured: c.featured,
    memberCount: c._count?.members ?? c.memberCount,
    postCount: c._count?.posts ?? c.postCount,
    createdById: c.createdById,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    joined: opts?.joined ?? false,
    myRole: opts?.myRole ?? null,
    moderators,
    primaryModerator: moderators[0]?.user ?? null,
  };
}

export async function listCommunitiesForUser(
  userId: string,
  departmentId: string,
  query?: {
    search?: string;
    category?: string;
    filter?: string;
    sort?: string;
  },
) {
  const where: Prisma.CommunityWhereInput = {
    status: { not: 'HIDDEN' },
    OR: [
      { visibility: 'PUBLIC', status: 'ACTIVE' },
      { status: 'ACTIVE', members: { some: { userId } } },
      { status: 'ARCHIVED', members: { some: { userId } } },
    ],
  };

  if (query?.category && query.category !== 'ALL') {
    where.category = query.category as CommunityCategory;
  }
  if (query?.search?.trim()) {
    const s = query.search.trim();
    where.AND = [
      {
        OR: [
          { name: { contains: s, mode: 'insensitive' } },
          { description: { contains: s, mode: 'insensitive' } },
          { tags: { has: s } },
        ],
      },
    ];
  }
  if (query?.filter === 'joined') {
    where.members = { some: { userId } };
  } else if (query?.filter === 'department') {
    where.departmentId = departmentId;
  } else if (query?.filter === 'official') {
    where.category = 'OFFICIAL';
  } else if (query?.filter === 'featured') {
    where.featured = true;
  }

  const orderBy: Prisma.CommunityOrderByWithRelationInput[] =
    query?.sort === 'members'
      ? [{ memberCount: 'desc' }, { name: 'asc' }]
      : query?.sort === 'posts'
        ? [{ postCount: 'desc' }, { name: 'asc' }]
        : query?.sort === 'name'
          ? [{ name: 'asc' }]
          : [{ featured: 'desc' }, { memberCount: 'desc' }, { createdAt: 'desc' }];

  const rows = await prisma.community.findMany({
    where,
    include: {
      department: { select: { id: true, name: true } },
      members: {
        where: {
          OR: [{ userId }, { role: { in: ['MODERATOR', 'ADMIN'] } }],
        },
        include: { user: { select: memberUserSelect } },
        take: 12,
      },
      _count: {
        select: {
          members: true,
          posts: { where: { isDeleted: false } },
        },
      },
    },
    orderBy,
    take: 100,
  });

  const mapped = rows.map((c) => {
    const mine = c.members.find((m) => m.userId === userId);
    return mapCommunity(c, {
      joined: Boolean(mine),
      myRole: mine?.role ?? null,
    });
  });

  const joined = mapped.filter((c) => c.joined);
  const featured = mapped.filter((c) => c.featured && c.status === 'ACTIVE');
  const official = mapped.filter((c) => c.category === 'OFFICIAL' && c.status === 'ACTIVE');
  const department = mapped.filter(
    (c) => c.departmentId === departmentId && c.status === 'ACTIVE',
  );
  const trending = [...mapped]
    .filter((c) => c.status === 'ACTIVE')
    .sort((a, b) => b.memberCount + b.postCount * 2 - (a.memberCount + a.postCount * 2))
    .slice(0, 12);
  const recommended = mapped
    .filter((c) => !c.joined && c.status === 'ACTIVE' && c.visibility === 'PUBLIC')
    .slice(0, 12);

  return {
    items: mapped,
    sections: {
      featured,
      joined,
      trending,
      department,
      official,
      recommended,
    },
  };
}

export async function adminListCommunities(query?: {
  search?: string;
  status?: string;
  category?: string;
}) {
  const where: Prisma.CommunityWhereInput = {};
  if (query?.status) where.status = query.status as CommunityStatus;
  if (query?.category) where.category = query.category as CommunityCategory;
  if (query?.search?.trim()) {
    const s = query.search.trim();
    where.OR = [
      { name: { contains: s, mode: 'insensitive' } },
      { description: { contains: s, mode: 'insensitive' } },
    ];
  }

  const rows = await prisma.community.findMany({
    where,
    include: {
      department: { select: { id: true, name: true } },
      members: {
        where: { role: { in: ['MODERATOR', 'ADMIN'] } },
        include: { user: { select: memberUserSelect } },
        take: 8,
      },
      _count: {
        select: {
          members: true,
          posts: { where: { isDeleted: false } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return rows.map((c) => mapCommunity(c));
}

export async function getCommunityDetail(communityId: string, userId: string, isAdmin = false) {
  const c = await prisma.community.findUnique({
    where: { id: communityId },
    include: {
      department: { select: { id: true, name: true } },
      members: {
        where: { role: { in: ['MODERATOR', 'ADMIN'] } },
        include: { user: { select: memberUserSelect } },
        take: 20,
      },
      _count: {
        select: {
          members: true,
          posts: { where: { isDeleted: false } },
        },
      },
    },
  });
  if (!c) throw new AppError(404, 'Community not found');
  if (c.status === 'HIDDEN' && !isAdmin) throw new AppError(404, 'Community not found');

  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });

  if (c.visibility === 'PRIVATE' && !membership && !isAdmin) {
    throw new AppError(403, 'This community is private');
  }

  return mapCommunity(c, {
    joined: Boolean(membership),
    myRole: membership?.role ?? null,
  });
}

export async function createCommunity(
  adminId: string,
  data: {
    name: string;
    description?: string;
    category?: CommunityCategory;
    departmentId?: string | null;
    bannerUrl?: string | null;
    iconUrl?: string | null;
    visibility?: CommunityVisibility;
    accessType?: CommunityAccess;
    rules?: string | null;
    tags?: string[];
    chatEnabled?: boolean;
    featured?: boolean;
    moderatorIds?: string[];
  },
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const name = data.name?.trim();
  if (!name) throw new AppError(400, 'Community name is required');
  if (name.length < 2) throw new AppError(400, 'Name is too short');

  const existingName = await prisma.community.findFirst({
    where: { name: { equals: name, mode: 'insensitive' }, status: { not: 'HIDDEN' } },
  });
  if (existingName) throw new AppError(409, 'A community with this name already exists');

  if (data.departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: data.departmentId } });
    if (!dept) throw new AppError(400, 'Department not found');
  }

  const slug = await uniqueSlug(name);
  const tags = (data.tags ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 12);

  const community = await prisma.community.create({
    data: {
      name,
      slug,
      description: sanitizeText(data.description ?? '', 2000),
      category: data.category ?? 'CLUB',
      departmentId: data.departmentId || null,
      bannerUrl: data.bannerUrl || null,
      iconUrl: data.iconUrl || null,
      visibility: data.visibility ?? 'PUBLIC',
      accessType: data.accessType ?? 'OPEN',
      rules: data.rules?.trim() || null,
      tags,
      chatEnabled: data.chatEnabled ?? true,
      featured: data.featured ?? false,
      createdById: adminId,
      memberCount: 1,
      members: {
        create: {
          userId: adminId,
          role: 'ADMIN',
        },
      },
    },
    include: {
      department: { select: { id: true, name: true } },
      members: {
        where: { role: { in: ['MODERATOR', 'ADMIN'] } },
        include: { user: { select: memberUserSelect } },
      },
      _count: { select: { members: true, posts: true } },
    },
  });

  const modIds = (data.moderatorIds ?? []).filter((id) => id !== adminId);
  for (const uid of modIds.slice(0, 20)) {
    const user = await prisma.user.findFirst({
      where: { id: uid, deletedAt: null, role: { in: ['STUDENT', 'STAFF', 'SUPER_ADMIN'] } },
    });
    if (!user) continue;
    await prisma.communityMember.upsert({
      where: { communityId_userId: { communityId: community.id, userId: uid } },
      create: { communityId: community.id, userId: uid, role: 'MODERATOR' },
      update: { role: 'MODERATOR' },
    });
  }

  if (modIds.length) {
    const count = await prisma.communityMember.count({ where: { communityId: community.id } });
    await prisma.community.update({
      where: { id: community.id },
      data: { memberCount: count },
    });
  }

  await writeAuditLog({
    userId: adminId,
    action: 'USER_CREATED',
    resourceType: 'community',
    resourceId: community.id,
    metadata: { name: community.name },
    ...meta,
  });

  return getCommunityDetail(community.id, adminId, true);
}

export async function updateCommunity(
  adminId: string,
  communityId: string,
  data: Partial<{
    name: string;
    description: string;
    category: CommunityCategory;
    departmentId: string | null;
    bannerUrl: string | null;
    iconUrl: string | null;
    visibility: CommunityVisibility;
    accessType: CommunityAccess;
    status: CommunityStatus;
    rules: string | null;
    tags: string[];
    chatEnabled: boolean;
    featured: boolean;
  }>,
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const existing = await prisma.community.findUnique({ where: { id: communityId } });
  if (!existing) throw new AppError(404, 'Community not found');

  if (data.name && data.name.trim() !== existing.name) {
    const clash = await prisma.community.findFirst({
      where: {
        name: { equals: data.name.trim(), mode: 'insensitive' },
        id: { not: communityId },
        status: { not: 'HIDDEN' },
      },
    });
    if (clash) throw new AppError(409, 'A community with this name already exists');
  }

  const slug =
    data.name && data.name.trim() !== existing.name
      ? await uniqueSlug(data.name.trim(), communityId)
      : undefined;

  await prisma.community.update({
    where: { id: communityId },
    data: {
      name: data.name?.trim(),
      slug,
      description:
        data.description !== undefined
          ? sanitizeText(data.description, 2000)
          : undefined,
      category: data.category,
      departmentId: data.departmentId === undefined ? undefined : data.departmentId || null,
      bannerUrl: data.bannerUrl === undefined ? undefined : data.bannerUrl || null,
      iconUrl: data.iconUrl === undefined ? undefined : data.iconUrl || null,
      visibility: data.visibility,
      accessType: data.accessType,
      status: data.status,
      rules: data.rules === undefined ? undefined : data.rules?.trim() || null,
      tags: data.tags,
      chatEnabled: data.chatEnabled,
      featured: data.featured,
    },
  });

  await writeAuditLog({
    userId: adminId,
    action: 'USER_UPDATED',
    resourceType: 'community',
    resourceId: communityId,
    metadata: { fields: Object.keys(data) },
    ...meta,
  });

  return getCommunityDetail(communityId, adminId, true);
}

export async function archiveCommunity(
  adminId: string,
  communityId: string,
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const existing = await prisma.community.findUnique({ where: { id: communityId } });
  if (!existing) throw new AppError(404, 'Community not found');
  await prisma.community.update({
    where: { id: communityId },
    data: { status: 'ARCHIVED' },
  });
  await writeAuditLog({
    userId: adminId,
    action: 'CONTENT_ARCHIVED',
    resourceType: 'community',
    resourceId: communityId,
    ...meta,
  });
  return { message: 'Community archived' };
}

export async function deleteCommunity(
  adminId: string,
  communityId: string,
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const existing = await prisma.community.findUnique({ where: { id: communityId } });
  if (!existing) throw new AppError(404, 'Community not found');
  // Soft-hide to preserve history; hard delete only if already archived empty
  await prisma.community.update({
    where: { id: communityId },
    data: { status: 'HIDDEN', featured: false },
  });
  await writeAuditLog({
    userId: adminId,
    action: 'CONTENT_DELETED',
    resourceType: 'community',
    resourceId: communityId,
    metadata: { name: existing.name },
    ...meta,
  });
  return { message: 'Community deleted' };
}

export async function joinCommunity(userId: string, communityId: string) {
  const c = await prisma.community.findUnique({ where: { id: communityId } });
  if (!c || c.status === 'HIDDEN') throw new AppError(404, 'Community not found');
  if (c.status === 'ARCHIVED') throw new AppError(400, 'Community is archived');
  if (c.accessType === 'INVITE') {
    throw new AppError(403, 'This community is invite-only');
  }
  if (c.visibility === 'PRIVATE' && c.accessType !== 'OPEN') {
    throw new AppError(403, 'This community is private');
  }

  const existing = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  if (existing) return { joined: true, message: 'Already a member' };

  await prisma.$transaction([
    prisma.communityMember.create({
      data: { communityId, userId, role: 'MEMBER' },
    }),
    prisma.community.update({
      where: { id: communityId },
      data: { memberCount: { increment: 1 } },
    }),
  ]);

  return { joined: true, message: 'Joined community' };
}

export async function leaveCommunity(userId: string, communityId: string) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  if (!membership) throw new AppError(400, 'You are not a member');
  if (membership.role === 'ADMIN') {
    const otherAdmins = await prisma.communityMember.count({
      where: { communityId, role: 'ADMIN', userId: { not: userId } },
    });
    if (otherAdmins === 0) {
      throw new AppError(400, 'Transfer admin role before leaving');
    }
  }

  await prisma.$transaction([
    prisma.communityMember.delete({ where: { id: membership.id } }),
    prisma.community.update({
      where: { id: communityId },
      data: { memberCount: { decrement: 1 } },
    }),
  ]);

  return { joined: false, message: 'Left community' };
}

export async function listMembers(communityId: string, actorId: string, isAdmin = false) {
  await getCommunityDetail(communityId, actorId, isAdmin);
  const members = await prisma.communityMember.findMany({
    where: { communityId },
    include: { user: { select: memberUserSelect } },
    orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    take: 200,
  });
  return members.map(mapMember);
}

export async function setModerator(
  adminId: string,
  communityId: string,
  userId: string,
  role: 'MODERATOR' | 'MEMBER' | 'ADMIN' = 'MODERATOR',
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const c = await prisma.community.findUnique({ where: { id: communityId } });
  if (!c) throw new AppError(404, 'Community not found');
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
  });
  if (!user) throw new AppError(404, 'User not found');

  await prisma.communityMember.upsert({
    where: { communityId_userId: { communityId, userId } },
    create: { communityId, userId, role },
    update: { role },
  });

  const count = await prisma.communityMember.count({ where: { communityId } });
  await prisma.community.update({
    where: { id: communityId },
    data: { memberCount: count },
  });

  await writeAuditLog({
    userId: adminId,
    action: 'USER_UPDATED',
    resourceType: 'community_member',
    resourceId: communityId,
    metadata: { userId, role },
    ...meta,
  });

  return { message: `Role set to ${role}` };
}

export async function removeMember(
  adminId: string,
  communityId: string,
  userId: string,
  meta?: { ipAddress?: string; userAgent?: string },
) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  if (!membership) throw new AppError(404, 'Member not found');

  await prisma.$transaction([
    prisma.communityMember.delete({ where: { id: membership.id } }),
    prisma.community.update({
      where: { id: communityId },
      data: { memberCount: { decrement: 1 } },
    }),
  ]);

  await writeAuditLog({
    userId: adminId,
    action: 'USER_UPDATED',
    resourceType: 'community_member',
    resourceId: communityId,
    metadata: { removedUserId: userId },
    ...meta,
  });

  return { message: 'Member removed' };
}

export async function listCommunityPosts(communityId: string, userId: string, isAdmin = false) {
  await getCommunityDetail(communityId, userId, isAdmin);
  const posts = await prisma.communityPost.findMany({
    where: { communityId, isDeleted: false },
    include: { user: { select: memberUserSelect } },
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    take: 50,
  });
  return posts.map((p) => ({
    id: p.id,
    content: p.content,
    mediaUrl: p.mediaUrl,
    pinned: p.pinned,
    createdAt: p.createdAt.toISOString(),
    isMine: p.userId === userId,
    author: {
      id: p.user.id,
      regNo: p.user.regNo,
      name: p.user.profile?.name ?? p.user.regNo,
      profilePhotoUrl: p.user.profile?.profilePhotoUrl ?? null,
    },
  }));
}

export async function createCommunityPost(
  userId: string,
  communityId: string,
  data: { content: string; mediaUrl?: string },
) {
  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
  });
  if (!membership) throw new AppError(403, 'Join the community to post');

  const content = sanitizeText(data.content ?? '', 4000);
  if (!content && !data.mediaUrl) throw new AppError(400, 'Post content is required');

  const post = await prisma.communityPost.create({
    data: {
      communityId,
      userId,
      content: content || '',
      mediaUrl: data.mediaUrl || null,
    },
    include: { user: { select: memberUserSelect } },
  });

  await prisma.community.update({
    where: { id: communityId },
    data: { postCount: { increment: 1 } },
  });

  return {
    id: post.id,
    content: post.content,
    mediaUrl: post.mediaUrl,
    pinned: post.pinned,
    createdAt: post.createdAt.toISOString(),
    isMine: true,
    author: {
      id: post.user.id,
      regNo: post.user.regNo,
      name: post.user.profile?.name ?? post.user.regNo,
      profilePhotoUrl: post.user.profile?.profilePhotoUrl ?? null,
    },
  };
}

export async function deleteCommunityPost(
  actor: { id: string; role: string },
  postId: string,
) {
  const post = await prisma.communityPost.findUnique({ where: { id: postId } });
  if (!post || post.isDeleted) throw new AppError(404, 'Post not found');

  const membership = await prisma.communityMember.findUnique({
    where: { communityId_userId: { communityId: post.communityId, userId: actor.id } },
  });
  const canDelete =
    post.userId === actor.id ||
    actor.role === 'SUPER_ADMIN' ||
    membership?.role === 'MODERATOR' ||
    membership?.role === 'ADMIN';
  if (!canDelete) throw new AppError(403, 'Not allowed');

  await prisma.communityPost.update({
    where: { id: postId },
    data: { isDeleted: true, content: '' },
  });
  await prisma.community.update({
    where: { id: post.communityId },
    data: { postCount: { decrement: 1 } },
  });
  return { message: 'Post deleted' };
}
