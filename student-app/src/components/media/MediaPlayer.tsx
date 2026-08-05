import { Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { resolveMediaUrl } from '../../lib/config';
import { isVideoMedia } from '../../lib/media';

export interface MediaPlayerProps {
  src: string;
  mimeType?: string | null;
  mediaType?: string | null;
  alt?: string;
  /** Feed / post: show controls, contain fit */
  variant?: 'feed' | 'story' | 'reel';
  poster?: string | null;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  className?: string;
  onEnded?: () => void;
  onError?: () => void;
  onLoaded?: () => void;
  onTimeUpdate?: (current: number, duration: number) => void;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}

/**
 * Renders <video> for video MIME/paths and <img> for images — never the reverse.
 * Feed posts should use PostVideoPlayer for full controls.
 */
export function MediaPlayer({
  src,
  mimeType,
  mediaType,
  alt = '',
  variant = 'feed',
  poster,
  autoPlay = false,
  muted = false,
  loop = false,
  className = '',
  onEnded,
  onError,
  onLoaded,
  onTimeUpdate,
  videoRef: externalRef,
}: MediaPlayerProps) {
  const internalRef = useRef<HTMLVideoElement | null>(null);
  const ref = externalRef ?? internalRef;
  const url = resolveMediaUrl(src) ?? src;
  const video = isVideoMedia({ mediaUrl: src, mediaMimeType: mimeType, mediaType });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
  }, [url]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !video) return;
    if (autoPlay) {
      void el.play().catch(() => undefined);
    }
  }, [url, video, autoPlay, ref]);

  // Pause when story/reel leaves viewport
  useEffect(() => {
    if (variant !== 'reel' && variant !== 'story') return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting && autoPlay) {
          void el.play().catch(() => undefined);
        } else {
          el.pause();
        }
      },
      { threshold: 0.55 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [variant, autoPlay, ref, url]);

  if (!src) return null;

  if (!video) {
    return (
      <img
        src={url}
        alt={alt}
        className={
          className ||
          (variant === 'story'
            ? 'h-full w-full object-contain bg-black'
            : 'max-h-[min(70vh,28rem)] w-full object-cover')
        }
        loading="lazy"
        onLoad={onLoaded}
        onError={onError}
      />
    );
  }

  const videoClass =
    className ||
    (variant === 'reel'
      ? 'h-full w-full bg-black object-cover'
      : variant === 'story'
        ? 'h-full w-full bg-black object-contain'
        : 'media-video-feed w-full bg-black');

  const typeAttr =
    mimeType && mimeType.startsWith('video/')
      ? mimeType
      : url.toLowerCase().includes('.webm')
        ? 'video/webm'
        : 'video/mp4';

  return (
    <div className="relative w-full bg-black">
      {loading ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/30">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
        </div>
      ) : null}
      <video
        ref={ref as React.RefObject<HTMLVideoElement>}
        key={url}
        className={videoClass}
        style={{ width: '100%', height: variant === 'feed' ? 'auto' : undefined }}
        playsInline
        preload="metadata"
        controls={variant === 'feed' || variant === 'reel'}
        controlsList="nodownload"
        muted={muted || variant === 'story'}
        autoPlay={autoPlay || variant === 'story' || variant === 'reel'}
        loop={loop || variant === 'reel'}
        poster={poster ? (resolveMediaUrl(poster) ?? poster) : undefined}
        onLoadStart={() => setLoading(true)}
        onWaiting={() => setLoading(true)}
        onLoadedData={() => {
          setLoading(false);
          onLoaded?.();
        }}
        onCanPlay={() => {
          setLoading(false);
          onLoaded?.();
        }}
        onEnded={onEnded}
        onError={() => {
          setLoading(false);
          onError?.();
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (onTimeUpdate && el.duration && Number.isFinite(el.duration)) {
            onTimeUpdate(el.currentTime, el.duration);
          }
        }}
      >
        <source src={url} type={typeAttr} />
        Your browser does not support this video. Use MP4 (H.264 + AAC) or WebM.
      </video>
    </div>
  );
}
