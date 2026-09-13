import { api } from './api';
import type { SkillCatalog, SkillMatchCard, SkillMatchVisibility, SkillProficiency } from '../types/skill-match';

export async function fetchSkillCatalog() {
  const res = await api<SkillCatalog>('/skill-match/catalog');
  return res.data!;
}

export async function fetchMySkillMatch() {
  const res = await api<SkillMatchCard>('/skill-match/me');
  return res.data!;
}

export async function saveMySkillMatch(payload: {
  skills?: Array<{ skillId: string; proficiency: SkillProficiency }>;
  interestIds?: string[];
  goalIds?: string[];
  availabilityIds?: string[];
  visibility?: SkillMatchVisibility;
}) {
  const res = await api<SkillMatchCard>('/skill-match/me', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return res.data!;
}

export async function discoverSkillMatches(params: {
  q?: string;
  skillId?: string;
  categoryId?: string;
  departmentId?: string;
  year?: number;
  goalId?: string;
  availabilityId?: string;
  sort?: 'best' | 'relevant' | 'recent';
  cursor?: string | null;
  limit?: number;
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.skillId) qs.set('skillId', params.skillId);
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.departmentId) qs.set('departmentId', params.departmentId);
  if (params.year) qs.set('year', String(params.year));
  if (params.goalId) qs.set('goalId', params.goalId);
  if (params.availabilityId) qs.set('availabilityId', params.availabilityId);
  if (params.sort) qs.set('sort', params.sort);
  if (params.cursor) qs.set('cursor', params.cursor);
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString();
  const res = await api<{
    items: SkillMatchCard[];
    nextCursor: string | null;
    hasMore: boolean;
    viewerReady: boolean;
    total: number;
  }>(`/skill-match/discover${query ? `?${query}` : ''}`);
  return res.data!;
}

export async function fetchSkillMatchProfile(userId: string) {
  const res = await api<SkillMatchCard>(`/skill-match/users/${userId}`);
  return res.data!;
}

export async function fetchSkillRequests() {
  const res = await api<{ incoming: SkillMatchCard[]; outgoing: SkillMatchCard[] }>(
    '/skill-match/requests',
  );
  return res.data!;
}

export async function sendSkillConnect(userId: string) {
  const res = await api<SkillMatchCard>('/skill-match/connect', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  return res.data!;
}

export async function acceptSkillConnect(requestId: string) {
  const res = await api<SkillMatchCard>('/skill-match/accept', {
    method: 'POST',
    body: JSON.stringify({ requestId }),
  });
  return res.data!;
}

export async function declineSkillConnect(requestId: string) {
  const res = await api<{ ok: boolean }>('/skill-match/decline', {
    method: 'POST',
    body: JSON.stringify({ requestId }),
  });
  return res.data!;
}

export async function cancelSkillConnect(requestId: string) {
  const res = await api<{ ok: boolean }>('/skill-match/cancel', {
    method: 'POST',
    body: JSON.stringify({ requestId }),
  });
  return res.data!;
}

export const PROFICIENCY_LABEL: Record<SkillProficiency, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
  EXPERT: 'Expert',
};
