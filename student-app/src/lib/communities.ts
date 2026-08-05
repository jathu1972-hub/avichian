import { api } from './api';

export type CommunityCategory =
  | 'CLUB'
  | 'SPORTS'
  | 'CULTURAL'
  | 'ACADEMIC'
  | 'DEPARTMENT'
  | 'OFFICIAL'
  | 'HOBBY'
  | 'TECH'
  | 'OTHER';

export interface CommunityUser {
  id: string;
  regNo: string;
  name: string;
  profilePhotoUrl: string | null;
}

export interface Community {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: CommunityCategory;
  departmentId: string | null;
  department: string | null;
  bannerUrl: string | null;
  iconUrl: string | null;
  visibility: 'PUBLIC' | 'PRIVATE';
  accessType: 'OPEN' | 'REQUEST' | 'INVITE';
  status: 'ACTIVE' | 'ARCHIVED' | 'HIDDEN';
  rules: string | null;
  tags: string[];
  chatEnabled: boolean;
  featured: boolean;
  memberCount: number;
  postCount: number;
  createdAt: string;
  joined: boolean;
  myRole: 'MEMBER' | 'MODERATOR' | 'ADMIN' | null;
  primaryModerator: CommunityUser | null;
  moderators?: Array<{
    id: string;
    role: string;
    user: CommunityUser;
  }>;
}

export interface CommunitySections {
  featured: Community[];
  joined: Community[];
  trending: Community[];
  department: Community[];
  official: Community[];
  recommended: Community[];
}

export interface CommunityPost {
  id: string;
  content: string;
  mediaUrl: string | null;
  pinned: boolean;
  createdAt: string;
  isMine: boolean;
  author: CommunityUser;
}

export interface CommunityMember {
  id: string;
  role: string;
  joinedAt: string;
  user: CommunityUser;
}

export async function fetchCommunities(params?: {
  search?: string;
  category?: string;
  filter?: string;
  sort?: string;
}) {
  const q = new URLSearchParams();
  if (params?.search) q.set('search', params.search);
  if (params?.category) q.set('category', params.category);
  if (params?.filter) q.set('filter', params.filter);
  if (params?.sort) q.set('sort', params.sort);
  const res = await api<{
    items: Community[];
    sections: CommunitySections;
  }>(`/communities?${q.toString()}`);
  return (
    res.data ?? {
      items: [],
      sections: {
        featured: [],
        joined: [],
        trending: [],
        department: [],
        official: [],
        recommended: [],
      },
    }
  );
}

export async function fetchCommunity(id: string) {
  const res = await api<Community>(`/communities/${id}`);
  return res.data!;
}

export async function joinCommunity(id: string) {
  return api(`/communities/${id}/join`, { method: 'POST' });
}

export async function leaveCommunity(id: string) {
  return api(`/communities/${id}/leave`, { method: 'POST' });
}

export async function fetchCommunityMembers(id: string) {
  const res = await api<CommunityMember[]>(`/communities/${id}/members`);
  return res.data ?? [];
}

export async function fetchCommunityPosts(id: string) {
  const res = await api<CommunityPost[]>(`/communities/${id}/posts`);
  return res.data ?? [];
}

export async function createCommunityPost(
  id: string,
  body: { content?: string; mediaUrl?: string },
) {
  const res = await api<CommunityPost>(`/communities/${id}/posts`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.data!;
}

export async function deleteCommunityPost(postId: string) {
  return api(`/communities/posts/${postId}`, { method: 'DELETE' });
}

export const COMMUNITY_CATEGORIES: { id: CommunityCategory | 'ALL'; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'OFFICIAL', label: 'Official' },
  { id: 'DEPARTMENT', label: 'Department' },
  { id: 'CLUB', label: 'Club' },
  { id: 'TECH', label: 'Tech' },
  { id: 'SPORTS', label: 'Sports' },
  { id: 'CULTURAL', label: 'Cultural' },
  { id: 'ACADEMIC', label: 'Academic' },
  { id: 'HOBBY', label: 'Hobby' },
  { id: 'OTHER', label: 'Other' },
];
