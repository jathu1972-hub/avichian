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
  mediaMimeType?: string | null;
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

    xhr.onerror = () =>
      reject(
        new Error(
          'Unable to connect to the server. Please try again later.',
        ),
      );
    xhr.ontimeout = () => reject(new Error('Story upload timed out'));
    xhr.timeout = 10 * 60 * 1000;
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
  if (isVideo && file.size > 100 * 1024 * 1024) return 'Videos must be 100MB or smaller';
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
 * Upload media with progress (0–100).
 * POST /api/uploads · multipart field "file" · Authorization Bearer JWT · X-CSRF-Token
 * Never set Content-Type manually (browser sets multipart boundary).
 */
export async function uploadMedia(
  file: File,
  purpose: UploadPurpose,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const attempt = async (forceCsrfRefresh: boolean): Promise<UploadResult> => {
    let csrf: string;
    try {
      csrf = forceCsrfRefresh
        ? await prefetchCsrfToken()
        : (readCsrfCookie() || (await prefetchCsrfToken()));
    } catch (e) {
      throw new Error(
        e instanceof Error
          ? e.message
          : 'Unable to connect to the server. Please try again later.',
      );
    }

    const token = getAccessToken();
    if (!token) {
      throw new Error('You are not signed in. Please log in again, then retry the upload.');
    }

    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append('file', file, file.name || `upload-${Date.now()}`);
      form.append('purpose', purpose);

      const xhr = new XMLHttpRequest();
      const url = `${getApiBase()}/uploads`;
      xhr.open('POST', url);
      xhr.withCredentials = true;
      xhr.timeout = 10 * 60 * 1000; // 10 min for large videos
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('X-CSRF-Token', csrf);
      // Do NOT set Content-Type

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !onProgress) return;
        onProgress(Math.round((event.loaded / event.total) * 100));
      };

      xhr.onload = () => {
        let json: {
          success?: boolean;
          error?: string;
          code?: string;
          data?: {
            url?: string;
            mediaUrl?: string;
            storageUrl?: string;
            mimeType?: string;
            fileType?: string;
            size?: number;
            fileSize?: number;
            id?: string;
            fileName?: string;
            csrfToken?: string;
          };
        } = {};
        try {
          json = JSON.parse(xhr.responseText || '{}');
        } catch {
          if (xhr.status === 0) {
            reject(
              new Error(
                'Unable to connect to the server. Please try again later.',
              ),
            );
            return;
          }
          const body = (xhr.responseText || '').trimStart();
          const isHtml =
            body.startsWith('<!doctype') ||
            body.startsWith('<!DOCTYPE') ||
            body.startsWith('<html');
          reject(
            new Error(
              isHtml
                ? `Upload failed (HTTP ${xhr.status}): received HTML instead of JSON. ` +
                    'Unable to connect to the server. Please try again later.'
                : `Upload failed (HTTP ${xhr.status}): server returned non-JSON. Check API logs.`,
            ),
          );
          return;
        }

        if (xhr.status === 403 && (json.code?.startsWith('CSRF') || String(json.error || '').includes('CSRF'))) {
          reject(Object.assign(new Error(json.error || 'CSRF validation failed'), { code: 'CSRF' }));
          return;
        }
        if (xhr.status === 401) {
          reject(
            Object.assign(new Error(json.error ?? 'Session expired — please log in again'), {
              code: 'AUTH',
            }),
          );
          return;
        }

        if (xhr.status >= 200 && xhr.status < 300 && json.success) {
          if (json.data?.csrfToken) setCsrfToken(json.data.csrfToken);
          const mediaUrl =
            json.data?.url ?? json.data?.mediaUrl ?? json.data?.storageUrl;
          if (!mediaUrl) {
            reject(new Error('Upload succeeded but server returned no media URL'));
            return;
          }
          console.info('[upload] success', { url: mediaUrl, mime: json.data?.mimeType, purpose });
          resolve({
            url: mediaUrl,
            mimeType: json.data?.mimeType ?? json.data?.fileType ?? file.type,
            size: json.data?.size ?? json.data?.fileSize ?? file.size,
            id: json.data?.id,
            fileName: json.data?.fileName,
          });
          return;
        }

        const msg =
          json.error ||
          (xhr.status === 413
            ? 'File too large (images 20MB, videos 100MB).'
            : `Upload failed (HTTP ${xhr.status})`);
        reject(new Error(msg));
      };

      xhr.onerror = () =>
        reject(
          new Error(
            'Unable to connect to the server. Please try again later.',
          ),
        );
      xhr.ontimeout = () =>
        reject(new Error('Upload timed out. Try a smaller file or check your connection.'));
      xhr.send(form);
    });
  };

  try {
    return await attempt(false);
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'CSRF' || code === 'AUTH') {
      try {
        await prefetchCsrfToken();
        return await attempt(true);
      } catch (retryErr) {
        throw retryErr instanceof Error ? retryErr : err;
      }
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
  const { submitReport } = await import('./safety');
  return submitReport({
    targetType: 'POST',
    targetId: postId,
    reason,
    details,
  });
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
  const { submitReport } = await import('./safety');
  return submitReport({
    targetType: 'STORY',
    targetId: storyId,
    reason,
    details,
  });
}

export async function muteUserStories(userId: string) {
  const res = await api<{ message: string }>(`/stories/mute/${userId}`, { method: 'POST' });
  return res.data!;
}

export interface ReelItem {
  id: string;
  ownerId: string;
  userId?: string;
  caption: string | null;
  hashtags?: string[];
  mediaUrl: string;
  videoUrl?: string;
  mediaMimeType?: string | null;
  coverUrl: string | null;
  thumbnailUrl?: string | null;
  audioName?: string | null;
  durationSec?: number | null;
  viewCount?: number;
  visibility: PostVisibility;
  createdAt: string;
  likeCount: number;
  commentCount?: number;
  saveCount?: number;
  likedByMe: boolean;
  savedByMe?: boolean;
  isMine: boolean;
  author: StudentSummary;
}

export interface ReelComment {
  id: string;
  reelId: string;
  body: string;
  parentId: string | null;
  createdAt: string;
  likeCount: number;
  likedByMe: boolean;
  replyCount?: number;
  isMine: boolean;
  author: {
    id: string;
    regNo: string;
    name: string;
    profilePhotoUrl: string | null;
  };
  replies?: ReelComment[];
}

export async function fetchReels(opts?: {
  cursor?: string;
  limit?: number;
  search?: string;
  hashtag?: string;
}) {
  const q = new URLSearchParams();
  if (opts?.cursor) q.set('cursor', opts.cursor);
  if (opts?.limit) q.set('limit', String(opts.limit));
  if (opts?.search) q.set('search', opts.search);
  if (opts?.hashtag) q.set('hashtag', opts.hashtag);
  const qs = q.toString();
  const res = await api<{ items: ReelItem[]; nextCursor: string | null } | ReelItem[]>(
    `/reels${qs ? `?${qs}` : ''}`,
  );
  // Support both paginated and legacy array responses
  const data = res.data;
  if (Array.isArray(data)) {
    return { items: data, nextCursor: null as string | null };
  }
  return {
    items: data?.items ?? [],
    nextCursor: data?.nextCursor ?? null,
  };
}

export async function fetchReel(reelId: string) {
  const res = await api<ReelItem>(`/reels/${reelId}`);
  return res.data!;
}

export async function createReel(payload: {
  mediaUrl: string;
  mediaMimeType?: string | null;
  caption?: string;
  coverUrl?: string;
  hashtags?: string[] | string;
  audioName?: string;
  durationSec?: number | null;
  visibility?: PostVisibility;
}) {
  const res = await api<ReelItem>('/reels', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data!;
}

/** Multipart reel upload: video + optional cover */
export async function createReelWithUpload(params: {
  video: File;
  cover?: File | null;
  caption?: string;
  hashtags?: string;
  audioName?: string;
  durationSec?: number;
  visibility?: PostVisibility | 'CAMPUS';
  onProgress?: (n: number) => void;
}): Promise<ReelItem> {
  const form = new FormData();
  form.append('video', params.video, params.video.name);
  if (params.cover) form.append('cover', params.cover, params.cover.name);
  if (params.caption) form.append('caption', params.caption);
  if (params.hashtags) form.append('hashtags', params.hashtags);
  if (params.audioName) form.append('audioName', params.audioName);
  if (params.durationSec != null) form.append('durationSec', String(params.durationSec));
  form.append('visibility', params.visibility ?? 'DEPARTMENT');

  // Reuse CSRF-aware fetch via api-like path with XHR for progress
  const { getApiBase } = await import('./config');
  const { getAccessToken, prefetchCsrfToken, setCsrfToken } = await import('./api');

  return new Promise((resolve, reject) => {
    void (async () => {
      try {
        const csrf = await prefetchCsrfToken();
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${getApiBase()}/reels/upload`);
        xhr.withCredentials = true;
        const token = getAccessToken();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.setRequestHeader('X-CSRF-Token', csrf);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && params.onProgress) {
            params.onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          try {
            const json = JSON.parse(xhr.responseText || '{}');
            if (json.data?.csrfToken) setCsrfToken(json.data.csrfToken);
            if (xhr.status >= 200 && xhr.status < 300 && json.success) {
              resolve(json.data as ReelItem);
            } else {
              reject(new Error(json.error || `Upload failed (${xhr.status})`));
            }
          } catch {
            reject(new Error('Invalid server response'));
          }
        };
        xhr.onerror = () =>
          reject(
            new Error(
              'Unable to connect to the server. Please try again later.',
            ),
          );
        xhr.ontimeout = () => reject(new Error('Reel upload timed out'));
        xhr.timeout = 10 * 60 * 1000;
        xhr.send(form);
      } catch (e) {
        reject(
          e instanceof Error
            ? e
            : new Error('Could not start reel upload — is the API online?'),
        );
      }
    })();
  });
}

export async function toggleReelSave(reelId: string) {
  const res = await api<{ saved: boolean }>(`/reels/${reelId}/save`, { method: 'POST' });
  return res.data!;
}

export async function recordReelView(reelId: string) {
  await api(`/reels/${reelId}/view`, { method: 'POST' });
}

export async function fetchReelComments(reelId: string) {
  const res = await api<ReelComment[]>(`/reels/${reelId}/comments`);
  return res.data ?? [];
}

export async function addReelComment(reelId: string, body: string, parentId?: string) {
  const res = await api<ReelComment>(`/reels/${reelId}/comment`, {
    method: 'POST',
    body: JSON.stringify({ body, parentId }),
  });
  return res.data!;
}

export async function deleteReelComment(commentId: string) {
  await api(`/reels/comments/${commentId}`, { method: 'DELETE' });
}

export async function toggleReelCommentLike(commentId: string) {
  const res = await api<{ liked: boolean; likeCount: number }>(
    `/reels/comments/${commentId}/like`,
    { method: 'POST' },
  );
  return res.data!;
}

export async function fetchSavedReels() {
  const res = await api<ReelItem[]>('/reels/saved/me');
  return res.data ?? [];
}

export async function fetchUserReels(userId: string) {
  const res = await api<ReelItem[]>(`/reels/user/${userId}`);
  return res.data ?? [];
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
  const { submitReport } = await import('./safety');
  return submitReport({
    targetType: 'REEL',
    targetId: reelId,
    reason,
    details,
  });
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

export type ChatMessageDto = {
  id: string;
  conversationId?: string;
  body: string | null;
  type: string;
  mediaUrl: string | null;
  fileName?: string | null;
  replyToId?: string | null;
  replyTo?: {
    id: string;
    body: string | null;
    type: string;
    senderId: string;
    mediaUrl: string | null;
    deleted?: boolean;
  } | null;
  senderId: string;
  deliveredAt?: string | null;
  seenAt: string | null;
  editedAt?: string | null;
  deleted?: boolean;
  createdAt: string;
  isMine: boolean;
};

export async function fetchConversations() {
  const res = await api<
    Array<{
      id: string;
      peer: (StudentSummary & { online?: boolean; lastSeen?: string | null }) | null;
      lastMessage: { id: string; body: string | null; type: string; createdAt: string; senderId: string } | null;
      unreadCount?: number;
      updatedAt: string;
    }>
  >('/chat/conversations');
  return res.data!;
}

export async function fetchMessages(conversationId: string) {
  const res = await api<ChatMessageDto[]>(`/chat/conversations/${conversationId}/messages`);
  return res.data!;
}

export async function sendChatMessage(
  conversationId: string,
  payload: {
    body?: string;
    type?: string;
    mediaUrl?: string;
    fileName?: string;
    replyToId?: string | null;
  },
) {
  const res = await api<ChatMessageDto>(`/chat/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return res.data!;
}

export async function editChatMessage(messageId: string, body: string) {
  const res = await api<ChatMessageDto>(`/chat/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body }),
  });
  return res.data!;
}

export async function deleteChatMessage(messageId: string) {
  const res = await api<ChatMessageDto>(`/chat/messages/${messageId}`, {
    method: 'DELETE',
  });
  return res.data!;
}

export async function markChatRead(conversationId: string) {
  const res = await api(`/chat/conversations/${conversationId}/read`, { method: 'POST' });
  return res.data!;
}

export {
  startCall,
  updateCallStatus,
  fetchCallHistory,
  fetchCallIceConfig,
  fetchLiveKitToken,
} from './calls';

export async function fetchNotifications() {
  const res = await api<{
    items: Array<{
      id: string;
      type: string;
      title: string;
      body: string;
      createdAt: string;
      readAt: string | null;
      isRead?: boolean;
      data?: {
        requestId?: string;
        userId?: string;
        senderName?: string;
        callId?: string;
      } | null;
    }>;
    unread: number;
  }>('/notifications');
  return res.data!;
}

export async function markNotificationsRead(ids?: string[]) {
  await api('/notifications/read', {
    method: 'POST',
    body: JSON.stringify(ids?.length ? { ids } : {}),
  });
}

export async function deleteNotification(id: string) {
  await api(`/notifications/${id}`, { method: 'DELETE' });
}

export async function unifiedSearch(params: {
  q?: string;
  type?: 'all' | 'students' | 'communities' | 'events';
  department?: string;
  year?: number;
  sort?: 'az' | 'recent' | 'active';
}) {
  const q = new URLSearchParams();
  if (params.q) q.set('q', params.q);
  if (params.type) q.set('type', params.type);
  if (params.department) q.set('department', params.department);
  if (params.year) q.set('year', String(params.year));
  if (params.sort) q.set('sort', params.sort);
  const res = await api<{
    students: SearchResult[];
    communities: Array<{
      kind: 'community';
      id: string;
      name: string;
      slug: string;
      description: string;
      coverUrl: string | null;
      memberCount: number;
    }>;
    events: Array<{
      kind: 'event';
      id: string;
      title: string;
      startsAt: string;
      venue: string | null;
      coverUrl: string | null;
    }>;
  }>(`/search?${q.toString()}`);
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

export async function acceptFriendByUserId(userId: string) {
  await api('/friends/accept', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function rejectFriendRequest(requestId: string) {
  await api(`/friends/requests/${requestId}/reject`, { method: 'POST' });
}

export async function unfriendUser(userId: string) {
  await api('/friends/unfriend', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function blockUser(userId: string) {
  const { blockUserSafety } = await import('./safety');
  await blockUserSafety(userId);
}

export async function unblockUser(userId: string) {
  await api('/friends/unblock', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
}

export async function fetchBlockedUsers() {
  const res = await api<
    Array<{
      id: string;
      regNo: string;
      name: string;
      department: string;
      profilePhotoUrl: string | null;
      blockedAt: string;
    }>
  >('/friends/blocked');
  return res.data!;
}

export async function recordStoryView(storyId: string) {
  await api(`/stories/${storyId}/view`, { method: 'POST' });
}

export async function fetchStoryViewers(storyId: string) {
  const res = await api<{
    viewers: Array<{
      id: string;
      regNo: string;
      name: string;
      profilePhotoUrl: string | null;
      viewedAt: string;
    }>;
    count: number;
  }>(`/stories/${storyId}/viewers`);
  return res.data!;
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