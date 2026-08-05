import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, Loader2, Maximize2, Pause, Play, X, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryGroup, StoryItem } from '../../types/social';
import {
  deleteStory,
  fetchStoryViewers,
  hideStory,
  muteUserStories,
  recordStoryView,
  reportStory,
} from '../../lib/social';
import { resolveMediaUrl } from '../../lib/config';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { isVideoMedia } from '../../lib/media';
import { ContentMenu } from './ContentMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';

interface StoryViewerProps {
  group: StoryGroup | null;
  onClose: () => void;
  onStoryRemoved?: (storyId: string, userId: string) => void;
  toast?: (msg: string) => void;
}

function isVideoStory(story: StoryItem): boolean {
  return isVideoMedia({
    mediaUrl: story.mediaUrl,
    mediaType: story.mediaType,
    mediaMimeType: story.mediaMimeType,
  });
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function StoryViewer({ group, onClose, onStoryRemoved, toast }: StoryViewerProps) {
  useBodyScrollLock(Boolean(group));
  const [index, setIndex] = useState(0);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaError, setMediaError] = useState('');
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showViewers, setShowViewers] = useState(false);
  const [viewers, setViewers] = useState<
    Array<{ id: string; name: string; profilePhotoUrl: string | null; viewedAt: string }>
  >([]);
  const [viewerCount, setViewerCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageTimerRef = useRef<number | null>(null);

  const story = group?.stories[index] ?? null;
  const video = story ? isVideoStory(story) : false;

  const goNext = useCallback(() => {
    if (!group) return;
    if (index < group.stories.length - 1) {
      setIndex((i) => i + 1);
    } else {
      onClose();
    }
  }, [group, index, onClose]);

  const goPrev = useCallback(() => {
    if (index > 0) setIndex((i) => i - 1);
  }, [index]);

  useEffect(() => {
    setIndex(0);
  }, [group?.user.id]);

  useEffect(() => {
    setMediaLoading(true);
    setMediaError('');
    setProgress(0);
    setPlaying(true);
    setMuted(true);
    setShowViewers(false);
    if (imageTimerRef.current) {
      window.clearInterval(imageTimerRef.current);
      imageTimerRef.current = null;
    }
    if (story?.id) {
      void recordStoryView(story.id).catch(() => undefined);
    }
  }, [story?.id]);

  // Auto-advance images only (videos advance on ended)
  useEffect(() => {
    if (!group || !story || video || mediaLoading || mediaError || !playing) return;

    const durationMs = 5000;
    const started = Date.now();
    imageTimerRef.current = window.setInterval(() => {
      const p = Math.min(1, (Date.now() - started) / durationMs);
      setProgress(p);
      if (p >= 1) {
        if (imageTimerRef.current) window.clearInterval(imageTimerRef.current);
        goNext();
      }
    }, 50);

    return () => {
      if (imageTimerRef.current) {
        window.clearInterval(imageTimerRef.current);
        imageTimerRef.current = null;
      }
    };
  }, [group, story, video, mediaLoading, mediaError, playing, goNext]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video) return;
    if (playing) {
      void el.play().catch(() => {
        // Autoplay with sound blocked — keep muted and retry
        el.muted = true;
        setMuted(true);
        void el.play().catch(() => setMediaError('Could not play this video'));
      });
    } else {
      el.pause();
    }
  }, [playing, video, story?.id]);

  if (!group || !story) return null;

  const activeGroup = group;
  const activeStory = story;

  async function handleDeleteStory() {
    setBusy(true);
    try {
      await deleteStory(activeStory.id);
      onStoryRemoved?.(activeStory.id, activeGroup.user.id);
      toast?.('Story deleted successfully.');
      if (activeGroup.stories.length <= 1) onClose();
      else if (index >= activeGroup.stories.length - 1) setIndex(Math.max(0, index - 1));
    } catch (err) {
      toast?.(err instanceof Error ? err.message : 'Could not delete story');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  function saveStory() {
    window.open(activeStory.mediaUrl, '_blank', 'noopener,noreferrer');
    toast?.('Opened media — long-press or use browser Save.');
  }

  function shareStory() {
    const url = activeStory.mediaUrl.startsWith('http')
      ? activeStory.mediaUrl
      : `${window.location.origin}${activeStory.mediaUrl}`;
    if (navigator.share) {
      void navigator.share({ title: 'AVICHIAN story', url }).catch(() => undefined);
    } else {
      void navigator.clipboard.writeText(url).then(() => toast?.('Link copied.'));
    }
  }

  const ownerMenu = [
    { id: 'delete', label: 'Delete Story', danger: true, onClick: () => setConfirmDelete(true) },
    { id: 'save', label: 'Save Story', onClick: saveStory },
    { id: 'share', label: 'Share Story', onClick: shareStory },
    {
      id: 'insights',
      label: 'Viewers',
      onClick: () => {
        void fetchStoryViewers(activeStory.id)
          .then((data) => {
            setViewers(data.viewers);
            setViewerCount(data.count);
            setShowViewers(true);
            setPlaying(false);
          })
          .catch((e) => toast?.(e instanceof Error ? e.message : 'Could not load viewers'));
      },
    },
  ];

  const viewerMenu = [
    {
      id: 'report',
      label: 'Report Story',
      danger: true,
      onClick: () => {
        const reason = window.prompt('Report reason', 'INAPPROPRIATE');
        if (!reason) return;
        void reportStory(activeStory.id, reason.toUpperCase())
          .then(() => toast?.('Report submitted.'))
          .catch((e) => toast?.(e instanceof Error ? e.message : 'Report failed'));
      },
    },
    {
      id: 'mute',
      label: 'Mute Stories',
      onClick: () => {
        void muteUserStories(activeGroup.user.id)
          .then(() => {
            toast?.('Stories muted.');
            onClose();
          })
          .catch((e) => toast?.(e instanceof Error ? e.message : 'Mute failed'));
      },
    },
    {
      id: 'hide',
      label: 'Hide Story',
      onClick: () => {
        void hideStory(activeStory.id)
          .then(() => {
            onStoryRemoved?.(activeStory.id, activeGroup.user.id);
            toast?.('Story hidden.');
            if (activeGroup.stories.length <= 1) onClose();
          })
          .catch((e) => toast?.(e instanceof Error ? e.message : 'Hide failed'));
      },
    },
  ];

  function togglePlay() {
    setPlaying((p) => !p);
  }

  function toggleMute() {
    const el = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (el) el.muted = next;
  }

  function requestFullscreen() {
    const el = videoRef.current;
    if (el?.requestFullscreen) void el.requestFullscreen();
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-0 sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Story viewer"
      >
        <div className="absolute right-4 top-4 z-20 flex items-center gap-1">
          <div className="rounded-full bg-white/10 [&_button]:text-white [&_button:hover]:bg-white/20">
            <ContentMenu actions={group.user.isMe ? ownerMenu : viewerMenu} />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full bg-white/10 p-2 text-white"
            aria-label="Close story"
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative h-full w-full max-h-dvh overflow-hidden bg-black shadow-2xl sm:h-auto sm:max-h-[min(90dvh,48rem)] sm:max-w-sm sm:rounded-3xl">
          {/* Progress bars */}
          <div className="absolute left-0 right-0 top-0 z-10 flex gap-1 p-3">
            {group.stories.map((s, i) => (
              <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full bg-white transition-[width] duration-75"
                  style={{
                    width:
                      i < index
                        ? '100%'
                        : i === index
                          ? `${Math.round(progress * 100)}%`
                          : '0%',
                  }}
                />
              </div>
            ))}
          </div>

          {/* Tap zones for prev/next */}
          <button
            type="button"
            className="absolute left-0 top-12 bottom-24 z-[5] w-1/3"
            aria-label="Previous"
            onClick={goPrev}
          />
          <button
            type="button"
            className="absolute right-0 top-12 bottom-24 z-[5] w-1/3"
            aria-label="Next"
            onClick={goNext}
          />

          <div className="relative flex aspect-[9/16] max-h-[min(80dvh,720px)] w-full items-center justify-center bg-black">
            {mediaLoading ? (
              <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-2 bg-black/40">
                <Loader2 className="animate-spin text-white" size={32} />
                <span className="text-xs text-white/70">Loading…</span>
              </div>
            ) : null}

            {mediaError ? (
              <div className="absolute inset-0 z-[4] flex flex-col items-center justify-center gap-2 px-6 text-center">
                <AlertCircle className="text-white/80" size={36} />
                <p className="text-sm text-white">{mediaError}</p>
                <button
                  type="button"
                  className="mt-2 rounded-full bg-white/15 px-4 py-2 text-xs text-white"
                  onClick={() => {
                    setMediaError('');
                    setMediaLoading(true);
                    if (videoRef.current) {
                      videoRef.current.load();
                      void videoRef.current.play().catch(() => undefined);
                    }
                  }}
                >
                  Try again
                </button>
              </div>
            ) : null}

            {video ? (
              <video
                key={story.id}
                ref={videoRef}
                src={resolveMediaUrl(story.mediaUrl) ?? story.mediaUrl}
                className="h-full w-full object-contain bg-black"
                playsInline
                preload="metadata"
                controls={false}
                controlsList="nodownload"
                muted={muted}
                autoPlay
                loop={false}
                onLoadedData={() => {
                  setMediaLoading(false);
                  setMediaError('');
                }}
                onCanPlay={() => setMediaLoading(false)}
                onWaiting={() => setMediaLoading(true)}
                onPlaying={() => {
                  setMediaLoading(false);
                  setPlaying(true);
                }}
                onTimeUpdate={(e) => {
                  const el = e.currentTarget;
                  if (el.duration && Number.isFinite(el.duration)) {
                    setProgress(el.currentTime / el.duration);
                  }
                }}
                onEnded={goNext}
                onError={() => {
                  setMediaLoading(false);
                  setMediaError(
                    'This video cannot be played. Export as MP4 (H.264 + AAC) or WebM — not HEVC/H.265.',
                  );
                }}
              >
                {story.mediaMimeType?.startsWith('video/') ? (
                  <source
                    src={resolveMediaUrl(story.mediaUrl) ?? story.mediaUrl}
                    type={story.mediaMimeType}
                  />
                ) : null}
              </video>
            ) : (
              <img
                key={story.id}
                src={resolveMediaUrl(story.mediaUrl) ?? story.mediaUrl}
                alt={story.caption ?? 'Story'}
                className="h-full w-full object-contain bg-black"
                onLoad={() => {
                  setMediaLoading(false);
                  setMediaError('');
                }}
                onError={() => {
                  setMediaLoading(false);
                  setMediaError('Could not load this image.');
                }}
              />
            )}
          </div>

          {/* Footer meta + video controls */}
          <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pt-12">
            <div className="flex items-center gap-3">
              {group.user.profilePhotoUrl ? (
                <img
                  src={group.user.profilePhotoUrl}
                  alt=""
                  className="h-9 w-9 rounded-full object-cover ring-2 ring-white/40"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/80 text-sm font-bold text-white">
                  {group.user.name.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-white">{group.user.name}</p>
                <p className="text-xs text-white/70">{formatTime(story.createdAt)}</p>
              </div>
            </div>
            {story.caption ? (
              <p className="mt-2 text-sm text-white/90">{story.caption}</p>
            ) : null}

            {video ? (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={togglePlay}
                  className="rounded-full bg-white/15 p-2 text-white"
                  aria-label={playing ? 'Pause' : 'Play'}
                >
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={progress}
                  onChange={(e) => {
                    const el = videoRef.current;
                    const v = Number(e.target.value);
                    setProgress(v);
                    if (el && el.duration) el.currentTime = v * el.duration;
                  }}
                  className="h-1 flex-1 accent-white"
                  aria-label="Seek"
                />
                <button
                  type="button"
                  onClick={toggleMute}
                  className="rounded-full bg-white/15 p-2 text-white"
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <button
                  type="button"
                  onClick={requestFullscreen}
                  className="rounded-full bg-white/15 p-2 text-white"
                  aria-label="Fullscreen"
                >
                  <Maximize2 size={16} />
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {showViewers ? (
          <div className="absolute inset-x-0 bottom-0 z-30 max-h-[50%] overflow-y-auto rounded-t-3xl bg-slate-950/95 p-4 text-white">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold">Viewers ({viewerCount})</p>
              <button
                type="button"
                className="text-sm text-white/70"
                onClick={() => {
                  setShowViewers(false);
                  setPlaying(true);
                }}
              >
                Close
              </button>
            </div>
            {viewers.length === 0 ? (
              <p className="text-sm text-white/50">No views yet</p>
            ) : (
              <ul className="space-y-2">
                {viewers.map((v) => (
                  <li key={v.id} className="flex items-center gap-3 text-sm">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/40 text-xs font-bold">
                      {v.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{v.name}</p>
                      <p className="text-[11px] text-white/50">{formatTime(v.viewedAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        <ConfirmDialog
          open={confirmDelete}
          title="Delete this story?"
          message="This action cannot be undone."
          confirmLabel="Delete"
          loading={busy}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => void handleDeleteStory()}
        />
      </motion.div>
    </AnimatePresence>
  );
}
