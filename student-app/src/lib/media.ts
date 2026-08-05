/**
 * Media type detection + safe URL resolution for posts, stories, reels.
 * Never treat video URLs as images.
 */

export function isVideoMime(mime?: string | null): boolean {
  if (!mime) return false;
  const m = mime.toLowerCase();
  return m.startsWith('video/') || m === 'application/mp4';
}

export function isImageMime(mime?: string | null): boolean {
  if (!mime) return false;
  return mime.toLowerCase().startsWith('image/');
}

/** Detect video from MIME, mediaType, or URL path / extension */
export function isVideoMedia(opts: {
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  mediaType?: string | null;
}): boolean {
  if (opts.mediaType) {
    const t = opts.mediaType.toUpperCase();
    if (t === 'VIDEO') return true;
    if (t === 'IMAGE') return false;
  }
  if (isVideoMime(opts.mediaMimeType)) return true;
  if (isImageMime(opts.mediaMimeType)) return false;

  const url = (opts.mediaUrl || '').toLowerCase();
  if (!url) return false;
  if (
    url.includes('story-video') ||
    url.includes('post-video') ||
    url.includes('/video/') ||
    url.includes('reel')
  ) {
    // folder names from storage.service purpose mapping
    if (url.includes('story-image') || url.includes('post-image') || url.includes('profile')) {
      return false;
    }
    if (url.includes('story-video') || url.includes('post-video')) return true;
  }
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}
