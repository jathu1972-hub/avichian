import {
  Bookmark,
  Heart,
  Loader2,
  MessageCircle,
  MoreVertical,
  Music2,
  Pause,
  Play,
  Share2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReelItem } from '../../lib/social';
import { resolveMediaUrl } from '../../lib/config';
import { StudentAvatar } from './StudentAvatar';

interface ReelCardProps {
  reel: ReelItem;
  active: boolean;
  onLike: (id: string) => void;
  onSave: (id: string) => void;
  onComment: (reel: ReelItem) => void;
  onMenu: (reel: ReelItem) => void;
  onShare: (reel: ReelItem) => void;
  onViewed?: (id: string) => void;
}

export function ReelCard({
  reel,
  active,
  onLike,
  onSave,
  onComment,
  onMenu,
  onShare,
  onViewed,
}: ReelCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [heartBurst, setHeartBurst] = useState(false);
  const viewed = useRef(false);
  const lastTap = useRef(0);

  const src = resolveMediaUrl(reel.mediaUrl) ?? reel.mediaUrl;
  const type =
    reel.mediaMimeType && reel.mediaMimeType.startsWith('video/')
      ? reel.mediaMimeType
      : 'video/mp4';
  const tags = reel.hashtags ?? [];
  const audioLabel = reel.audioName || 'Original audio';

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (active) {
      v.muted = muted;
      void v
        .play()
        .then(() => {
          setPlaying(true);
          if (!viewed.current) {
            viewed.current = true;
            onViewed?.(reel.id);
          }
        })
        .catch(() => setPlaying(false));
    } else {
      v.pause();
      setPlaying(false);
    }
  }, [active, muted, src, reel.id, onViewed]);

  // Preload slightly when becoming next/active
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.preload = active ? 'auto' : 'metadata';
  }, [active]);

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().then(() => setPlaying(true)).catch(() => undefined);
    else {
      v.pause();
      setPlaying(false);
    }
  }

  function handleTap() {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      onLike(reel.id);
      setHeartBurst(true);
      window.setTimeout(() => setHeartBurst(false), 700);
      lastTap.current = 0;
      return;
    }
    lastTap.current = now;
    window.setTimeout(() => {
      if (Date.now() - lastTap.current >= 280) togglePlay();
    }, 280);
  }

  return (
    <section
      className="relative h-full w-full shrink-0 snap-start snap-always overflow-hidden bg-black"
      data-reel-id={reel.id}
    >
      <video
        ref={videoRef}
        key={src}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        loop
        muted={muted}
        preload={active ? 'auto' : 'metadata'}
        poster={(() => {
          const raw = reel.coverUrl || reel.thumbnailUrl;
          if (!raw) return undefined;
          return resolveMediaUrl(raw) ?? raw;
        })()}
        controls={false}
        controlsList="nodownload"
        onLoadStart={() => setLoading(true)}
        onWaiting={() => setLoading(true)}
        onLoadedData={() => setLoading(false)}
        onCanPlay={() => setLoading(false)}
        onPlaying={() => {
          setLoading(false);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration && Number.isFinite(el.duration)) {
            setProgress(el.currentTime / el.duration);
          }
        }}
        onError={() => {
          setLoading(false);
          setError('This reel cannot play. Use MP4 (H.264 + AAC) or WebM.');
        }}
        onClick={handleTap}
      >
        <source src={src} type={type} />
      </video>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/60 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-black/85 via-black/45 to-transparent" />

      <div className="absolute left-0 right-0 top-0 z-20 h-0.5 bg-white/15">
        <div className="h-full bg-white/90" style={{ width: `${progress * 100}%` }} />
      </div>

      {loading && !error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-white/90" />
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-6 text-center">
          <p className="text-sm text-white/90">{error}</p>
        </div>
      ) : null}

      {!playing && !loading && !error ? (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur">
            <Play size={28} className="ml-0.5" fill="currentColor" />
          </div>
        </div>
      ) : null}

      {heartBurst ? (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <Heart size={88} className="animate-ping text-rose-500" fill="currentColor" />
        </div>
      ) : null}

      {/* Right rail */}
      <div className="absolute bottom-32 right-2 z-20 flex flex-col items-center gap-4 sm:right-3 sm:gap-5">
        <Action
          label={String(reel.likeCount)}
          active={reel.likedByMe}
          onClick={() => onLike(reel.id)}
          aria="Like"
        >
          <Heart size={26} fill={reel.likedByMe ? 'currentColor' : 'none'} />
        </Action>
        <Action
          label={String(reel.commentCount ?? 0)}
          onClick={() => onComment(reel)}
          aria="Comments"
        >
          <MessageCircle size={26} />
        </Action>
        <Action label="Share" onClick={() => onShare(reel)} aria="Share">
          <Share2 size={24} />
        </Action>
        <Action
          label="Save"
          active={reel.savedByMe}
          onClick={() => onSave(reel.id)}
          aria="Save"
        >
          <Bookmark size={24} fill={reel.savedByMe ? 'currentColor' : 'none'} />
        </Action>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMuted((m) => !m);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <VolumeX size={22} /> : <Volume2 size={22} />}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMenu(reel);
          }}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
          aria-label="More"
        >
          <MoreVertical size={22} />
        </button>
      </div>

      {/* Left bottom meta */}
      <div className="absolute bottom-0 left-0 right-16 z-20 space-y-2 p-4 pb-safe sm:right-20">
        <Link
          to={`/home/user/${reel.author.id}`}
          className="inline-flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <StudentAvatar name={reel.author.name} photoUrl={reel.author.profilePhotoUrl} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white drop-shadow">{reel.author.name}</p>
            <p className="truncate text-[11px] text-white/75">{reel.author.department}</p>
          </div>
        </Link>
        {reel.caption ? (
          <p className="line-clamp-3 text-sm text-white/95 drop-shadow">{reel.caption}</p>
        ) : null}
        {tags.length > 0 ? (
          <p className="line-clamp-2 text-xs font-medium text-sky-200">
            {tags.map((t) => `#${t}`).join(' ')}
          </p>
        ) : null}
        <div className="flex items-center gap-2 overflow-hidden text-xs text-white/80">
          <Music2 size={14} className="shrink-0" />
          <div className="min-w-0 flex-1 overflow-hidden">
            <p className="animate-marquee whitespace-nowrap">
              {audioLabel} · {audioLabel} · {audioLabel}
            </p>
          </div>
          {playing ? (
            <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] text-white/50">
              <Pause size={10} /> live
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Action({
  children,
  label,
  onClick,
  active,
  aria,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  aria: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex flex-col items-center gap-0.5 text-white ${active ? 'text-rose-400' : ''}`}
      aria-label={aria}
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-black/40 backdrop-blur">
        {children}
      </span>
      <span className="text-[11px] font-semibold tabular-nums drop-shadow">{label}</span>
    </button>
  );
}
