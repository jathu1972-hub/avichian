import { api, getAccessToken, prefetchCsrfToken, setCsrfToken } from './api';
import { getApiBase } from './config';
import type {
  FeedPost,
  FriendRequestItem,
  PostVisibility,
  SearchResult,
  StoryGroup,
  StudentProfile,
  StudentSummary,
} from '../types/social';

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function fetchFeed(cursor?: string) {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const res = await api<{ posts: FeedPost[]; nextCursor: string | null }>(`/posts/feed${query}`);
  return res.data!;
}

export async function fetchStories() {
  const res = await api<StoryGroup[]>('/stories');
  const data = res.data ?? [];
  return data;
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

export async function createStory(payload: {
  mediaUrl: string;
  caption?: string;
  mediaType?: 'IMAGE' | 'VIDEO';
  mimeType?: string;
  visibility?: string;
}) {
  const res = await api<{
    id: string;
    mediaUrl: string;
    mediaType: 'IMAGE' | 'VIDEO';
    caption: string | null;
    createdAt: string;
    expiresAt: string;
  }>('/stories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  if (!res.data?.id) {
    throw new Error('Story was not saved to the database');
  }
  return res.data;
}

/**
 * Preferred: single multipart request stores file + creates PostgreSQL Story row.
 * Avoids orphan uploads when JSON createStory fails after /uploads succeeds.
 */
export async function createStoryWithUpload(
  file: File,
  options: {
    caption?: string;
    visibility?: string;
    onProgress?: (percent: number) => void;
  } = {},
): Promise<{
  id: string;
  mediaUrl: string;
  mediaType: 'IMAGE' | 'VIDEO';
  caption: string | null;
  createdAt: string;
  expiresAt: string;
}> {
  let csrf = readCsrfCookie();
  if (!csrf) csrf = await prefetchCsrfToken();

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file.name || `story-${Date.now()}`);
    if (options.caption) form.append('caption', options.caption);
    if (options.visibility) form.append('visibility', options.visibility);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getApiBase()}/stories/upload`);
    xhr.withCredentials = true;
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !options.onProgress) return;
      options.onProgress(Math.round((event.loaded / event.total) * 100));
    };

    xhr.onload = () => {
      let json: {
        success?: boolean;
        error?: string;
        data?: {
          id?: string;
          mediaUrl?: string;
          mediaType?: 'IMAGE' | 'VIDEO';
          caption?: string | null;
          createdAt?: string;
          expiresAt?: string;
        };
      } = {};
      try {
        json = JSON.parse(xhr.responseText || '{}');
      } catch {
        reject(new Error(`Story upload failed (${xhr.status}): invalid response`));
        return;
      }

      if (xhr.status >= 200 && xhr.status < 300 && json.success && json.data?.id) {
        resolve({
          id: json.data.id,
          mediaUrl: json.data.mediaUrl!,
          mediaType: json.data.mediaType ?? 'IMAGE',
          caption: json.data.caption ?? null,
          createdAt: json.data.createdAt ?? new Date().toISOString(),
          expiresAt: json.data.expiresAt ?? new Date().toISOString(),
        });
        return;
      }
      reject(new Error(json.error ?? `Story not saved (${xhr.status})`));
    };

    xhr.onerror = () => reject(new Error('Network error while creating story'));
    xhr.send(form);
  });
}

export type UploadPurpose =
  | 'profile'
  | 'cover'
  | 'post_image'
  | 'post_video'
  | 'story_image'
  | 'story_video'
  | 'document';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']);
const DOC_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

export function purposeForFile(
  file: File,
  context: 'profile' | 'cover' | 'post' | 'story' | 'document',
): UploadPurpose {
  if (context === 'profile') return 'profile';
  if (context === 'cover') return 'cover';
  if (context === 'document') return 'document';
  const mime = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  const isVideo =
    mime.startsWith('video/') ||
    VIDEO_TYPES.has(mime) ||
    /\.(mp4|mov|webm|m4v)$/i.test(name);
  if (context === 'story') return isVideo ? 'story_video' : 'story_image';
  return isVideo ? 'post_video' : 'post_image';
}

/** Compress images client-side (JPEG/WebP) before upload. Videos pass through. */
export async function compressImageIfNeeded(file: File, maxEdge = 1920, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  if (file.size < 400_000) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', quality),
  );
  if (!blob || blob.size >= file.size) return file;
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}

export function validateMediaFile(
  file: File,
  context: 'profile' | 'cover' | 'post' | 'story' | 'document',
): string | null {
  const mime = (file.type || '').toLowerCase();
  const name = file.name.toLowerCase();
  if (context === 'profile' || context === 'cover') {
    const okImage =
      IMAGE_TYPES.has(mime) ||
      mime.startsWith('image/') ||
      /\.(jpe?g|png|webp)$/i.test(name);
    if (!okImage) return 'Photo must be JPG, PNG, or WEBP';
    if (file.size > 10 * 1024 * 1024) return 'Photo must be 10MB or smaller';
    return null;
  }
  if (context === 'document') {
    const okDoc =
      DOC_TYPES.has(mime) ||
      /\.(pdf|doc|docx|txt|xls|xlsx)$/i.test(name);
    if (!okDoc) return 'Document must be PDF, Word, Excel, or TXT';
    if (file.size > 100 * 1024 * 1024) return 'Documents must be 100MB or smaller';
    return null;
  }
  const isVideo =
    mime.startsWith('video/') || VIDEO_TYPES.has(mime) || /\.(mp4|mov|webm|m4v)$/i.test(name);
  const isImage =
    mime.startsWith('image/') || IMAGE_TYPES.has(mime) || /\.(jpe?g|png|webp)$/i.test(name);
  if (!isVideo && !isImage) {
    return 'Unsupported file. Use JPG, PNG, WEBP, MP4, MOV, or WEBM';
  }
  if (isImage && file.size > 20 * 1024 * 1024) return 'Images must be 20MB or smaller';
  if (isVideo && file.size > 500 * 1024 * 1024) return 'Videos must be 500MB or smaller';
  return null;
}

export interface UploadResult {
  url: string;
  mimeType: string;
  size: number;
  id?: string;
  fileName?: string;
}

/**
 * Upload media with progress (0–100). Uses multipart FormData — never set Content-Type manually.
 */
export async function uploadMedia(
  file: File,
  purpose: UploadPurpose,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const attempt = async (forceCsrfRefresh: boolean): Promise<UploadResult> => {
    let csrf = forceCsrfRefresh ? null : readCsrfCookie();
    if (!csrf) csrf = await prefetchCsrfToken();

    return new Promise((resolve, reject) => {
      const form = new FormData();
      // Field name MUST be "file" (backend multer)
      form.append('file', file, file.name || `upload-${Date.now()}`);
      form.append('purpose', purpose);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${getApiBase()}/uploads`);
      xhr.withCredentials = true;
      const token = getAccessToken();
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
      // Do NOT set Content-Type — browser sets multipart boundary

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !onProgress) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      };

      xhr.onload = () => {
        let json: {
          success?: boolean;
          error?: string;
          data?: {
            url?: string;
            storageUrl?: string;
            mimeType?: string;
            size?: number;
            id?: string;
            fileName?: string;
            csrfToken?: string;
          };
        } = {};
        try {
          json = JSON.parse(xhr.responseText || '{}');
        } catch {
          reject(new Error(`Upload failed (${xhr.status}): invalid server response`));
          return;
        }

        if (xhr.status === 403 && typeof json.error === 'string' && json.error.includes('CSRF')) {
          reject(Object.assign(new Error(json.error), { code: 'CSRF' }));
          return;
        }
        if (xhr.status === 401) {
          reject(Object.assign(new Error(json.error ?? 'Unauthorized'), { code: 'AUTH' }));
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300 && json.success) {
          if (json.data?.csrfToken) setCsrfToken(json.data.csrfToken);
          const url = json.data?.url ?? json.data?.storageUrl;
          if (!url) {
            reject(new Error('Upload succeeded but server returned no URL'));
            return;
          }
          resolve({
            url,
            mimeType: json.data?.mimeType ?? file.type,
            size: json.data?.size ?? file.size,
            id: json.data?.id,
            fileName: json.data?.fileName,
          });
          return;
        }
        reject(new Error(json.error ?? `Upload failed (${xhr.status})`));
      };

      xhr.onerror = () => reject(new Error('Network error during upload — is the API running?'));
      xhr.send(form);
    });
  };

  try {
    return await attempt(false);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'CSRF' || code === 'AUTH') {
      await prefetchCsrfToken();
      return attempt(true);
    }
    throw err;
  }
}

export async function uploadProfilePhoto(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult & { user?: import('@avichian/shared').PublicUser }> {
  // Prefer dedicated endpoint that also updates profile
  let csrf = readCsrfCookie();
  if (!csrf) csrf = await prefetchCsrfToken();

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getApiBase()}/profile/photo`);
    xhr.withCredentials = true;
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && json.success) {
          resolve({
            url: json.data.url,
            mimeType: json.data.fileType,
            size: json.data.fileSize,
            id: json.data.id,
            user: json.data.user,
          });
          return;
        }
        reject(new Error(json.error ?? 'Profile photo upload failed'));
      } catch {
        reject(new Error(`Profile photo upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during profile photo upload'));
    xhr.send(form);
  });
}

export async function uploadCoverPhoto(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResult & { user?: import('@avichian/shared').PublicUser }> {
  let csrf = readCsrfCookie();
  if (!csrf) csrf = await prefetchCsrfToken();

  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${getApiBase()}/profile/cover`);
    xhr.withCredentials = true;
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    if (csrf) xhr.setRequestHeader('X-CSRF-Token', csrf);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && json.success) {
          resolve({
            url: json.data.url,
            mimeType: json.data.fileType,
            size: json.data.fileSize,
            id: json.data.id,
            user: json.data.user,
          });
          return;
        }
        reject(new Error(json.error ?? 'Cover photo upload failed'));
      } catch {
        reject(new Error(`Cover photo upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during cover photo upload'));
    xhr.send(form);
  });
}

export async function toggleLike(postId: string) {
  const res = await api<{ liked: boolean; likeCount: number }>(`/posts/${postId}/like`, {
    method: 'POST',
  });
  return res.data!;
}

export async function updatePost(
  postId: string,
  payload: { caption?: string; visibility?: PostVisibility },
) {
  const res = await api<FeedPost>(`/posts/${postId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return res.data!;
}

export async function deletePost(postId: string) {
  const res = await api<{ message: string; id: string }>(`/posts/${postId}`, { method: 'DELETE' });
  return res.data!;
}

export async function archivePost(postId: string) {
  const res = await api<{ message: string; id: string }>(`/posts/${postId}/archive`, {
    method: 'POST',
  });
  return res.data!;
}

export async function hidePost(postId: string) {
  const res = await api<{ message: string }>(`/posts/${postId}/hide`, { method: 'POST' });
  return res.data!;
}

export async function reportPost(postId: string, reason: string, details?: string) {
  const res = await api<{ message: string }>(`/posts/${postId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, details }),
  });
  return res.data!;
}

export async function deleteStory(storyId: string) {
  const res = await api<{ message: string; id: string }>(`/stories/${storyId}`, {
    method: 'DELETE',
  });
  return res.data!;
}

export async function hideStory(storyId: string) {
  const res = await api<{ message: string }>(`/stories/${storyId}/hide`, { method: 'POST' });
  return res.data!;
}

export async function reportStory(storyId: string, reason: string, details?: string) {
  const res = await api<{ message: string }>(`/stories/${storyId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, details }),
  });
  return res.data!;
}

export async function muteUserStories(userId: string) {
  const res = await api<{ message: string }>(`/stories/mute/${userId}`, { method: 'POST' });
  return res.data!;
}

export interface ReelItem {
  id: string;
  ownerId: string;
  caption: string | null;
  mediaUrl: string;
  coverUrl: string | null;
  visibility: PostVisibility;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  isMine: boolean;
  author: StudentSummary;
}

export async function fetchReels() {
  const res = await api<ReelItem[]>('/reels');
  return res.data ?? [];
}

export async function createReel(payload: {
  mediaUrl: string;
  caption?: string;
  coverUrl?: string;
  visibility?: PostVisibility;
}) {
  const res = await api<ReelItem>('/reels', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data!;
}

export async function updateReel(
  reelId: string,
  payload: { caption?: string; coverUrl?: string | null; visibility?: PostVisibility },
) {
  const res = await api<ReelItem>(`/reels/${reelId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return res.data!;
}

export async function deleteReel(reelId: string) {
  const res = await api<{ message: string; id: string }>(`/reels/${reelId}`, {
    method: 'DELETE',
  });
  return res.data!;
}

export async function archiveReel(reelId: string) {
  const res = await api<{ message: string }>(`/reels/${reelId}/archive`, { method: 'POST' });
  return res.data!;
}

export async function hideReel(reelId: string) {
  const res = await api<{ message: string }>(`/reels/${reelId}/hide`, { method: 'POST' });
  return res.data!;
}

export async function reportReel(reelId: string, reason: string, details?: string) {
  const res = await api<{ message: string }>(`/reels/${reelId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason, details }),
  });
  return res.data!;
}

export async function toggleReelLike(reelId: string) {
  const res = await api<{ liked: boolean; likeCount: number }>(`/reels/${reelId}/like`, {
    method: 'POST',
  });
  return res.data!;
}

export async function searchStudents(query: string) {
  const res = await api<SearchResult[]>(`/search/students?q=${encodeURIComponent(query)}`);
  return res.data!;
}

export async function openChatWithPeer(peerId: string) {
  const res = await api<{ id: string; peer: StudentSummary | null }>(`/chat/with/${peerId}`, {
    method: 'POST',
  });
  return res.data!;
}

export async function fetchConversations() {
  const res = await api<
    Array<{
      id: string;
      peer: (StudentSummary & { online?: boolean }) | null;
      lastMessage: { id: string; body: string | null; type: string; createdAt: string; senderId: string } | null;
      updatedAt: string;
    }>
  >('/chat/conversations');
  return res.data!;
}

export async function fetchMessages(conversationId: string) {
  const res = await api<
    Array<{
      id: string;
      body: string | null;
      type: string;
      mediaUrl: string | null;
      senderId: string;
      seenAt: string | null;
      createdAt: string;
      isMine: boolean;
    }>
  >(`/chat/conversations/${conversationId}/messages`);
  return res.data!;
}

export async function sendChatMessage(
  conversationId: string,
  payload: { body?: string; type?: string; mediaUrl?: string },
) {
  const res = await api(`/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data!;
}

export async function startCall(receiverId: string, type: 'VOICE' | 'VIDEO') {
  const res = await api<{
    id: string;
    type: string;
    status: string;
    roomName: string | null;
    livekitUrl: string | null;
  }>('/calls/start', {
    method: 'POST',
    body: JSON.stringify({ receiverId, type }),
  });
  return res.data!;
}

export async function updateCallStatus(
  callId: string,
  status: 'MISSED' | 'REJECTED' | 'COMPLETED' | 'FAILED',
  duration = 0,
) {
  await api(`/calls/${callId}/status`, {
    method: 'POST',
    body: JSON.stringify({ status, duration }),
  });
}

export async function fetchCallHistory() {
  const res = await api('/calls/history');
  return res.data!;
}

export async function fetchNotifications() {
  const res = await api<{
    items: Array<{
      id: string;
      type: string;
      title: string;
      body: string;
      createdAt: string;
      readAt: string | null;
    }>;
    unread: number;
  }>('/notifications');
  return res.data!;
}

export async function markNotificationsRead(ids?: string[]) {
  await api('/notifications/read', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
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

export async function cancelFriendRequest(requestId: string) {
  await api(`/friends/requests/${requestId}/cancel`, { method: 'POST' });
}

export async function fetchStudentProfile(userId: string) {
  const res = await api<StudentProfile>(`/profile/${userId}`);
  return res.data!;
}

export async function fetchUserPosts(userId: string) {
  const res = await api<FeedPost[]>(`/posts/user/${userId}`);
  return res.data!;
}

export async function updateMyProfile(payload: {
  bio?: string;
  profilePhotoUrl?: string;
  coverPhotoUrl?: string;
}) {
  const res = await api<import('@avichian/shared').PublicUser>('/profile/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
  return res.data!;
}

/** @deprecated Prefer uploadMedia — kept for small previews only */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}