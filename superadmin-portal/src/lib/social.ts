import { api } from './api';
import type {
  FeedPost,
  FriendRequestItem,
  PostVisibility,
  SearchResult,
  StoryGroup,
  StudentProfile,
  StudentSummary,
} from '../types/social';

export async function fetchFeed(cursor?: string) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const res = await api<{ posts: FeedPost[]; nextCursor: string | null }>(`/posts/feed${query}`);
  return res.data!;
}

export async function fetchStories() {
  const res = await api<StoryGroup[]>('/stories');
  return res.data!;
}

export async function createPost(payload: {
  caption?: string;
  mediaUrl?: string;
  visibility?: PostVisibility;
}) {
  const res = await api<FeedPost>('/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data!;
}

export async function createStory(payload: { mediaUrl: string; caption?: string }) {
  const res = await api('/stories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data;
}

export async function toggleLike(postId: string) {
  const res = await api<{ liked: boolean; likeCount: number }>(`/posts/${postId}/like`, {
    method: 'POST',
  });
  return res.data!;
}

export async function searchStudents(query: string) {
  const res = await api<SearchResult[]>(`/search/students?q=${encodeURIComponent(query)}`);
  return res.data!;
}

export async function fetchFriends() {
  const res = await api<StudentSummary[]>('/friends');
  return res.data!;
}

export async function fetchFriendRequests() {
  const res = await api<{
    incoming: FriendRequestItem[];
    outgoing: FriendRequestItem[];
  }>('/friends/requests');
  return res.data!;
}

export async function sendFriendRequest(receiverId: string) {
  await api('/friends/requests', {
    method: 'POST',
    body: JSON.stringify({ receiverId }),
  });
}

export async function acceptFriendRequest(requestId: string) {
  await api(`/friends/requests/${requestId}/accept`, { method: 'POST' });
}

export async function rejectFriendRequest(requestId: string) {
  await api(`/friends/requests/${requestId}/reject`, { method: 'POST' });
}

export async function fetchStudentProfile(userId: string) {
  const res = await api<StudentProfile>(`/profile/${userId}`);
  return res.data!;
}

export async function fetchUserPosts(userId: string) {
  const res = await api<FeedPost[]>(`/posts/user/${userId}`);
  return res.data!;
}

export async function updateMyProfile(payload: { bio?: string; profilePhotoUrl?: string }) {
  const res = await api<import('@avichian/shared').PublicUser>('/profile/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return res.data!;
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}