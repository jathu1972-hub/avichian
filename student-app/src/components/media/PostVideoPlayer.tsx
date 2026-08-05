import {
  Loader2,
  Maximize,
  Minimize2,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { resolveMediaUrl } from '../../lib/config';

interface PostVideoPlayerProps {
  src: string;
  mimeType?: string | null;
  className?: string;
}

/**
 * Feed post video: thumbnail, inline play, mute, fullscreen, loading spinner.
 * Uses HTML5 video with playsInline for iOS/Android/Desktop.
 */
export function PostVideoPlayer({ src, mimeType, className = '' }: PostVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const url = resolveMediaUrl(src) ?? src;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [showUi, setShowUi] = useState(true);
  const hideTimer = useRef<number | null>(null);

  const type =
    mimeType && mimeType.startsWith('video/')
      ? mimeType
      : url.toLowerCase().includes('.webm')
        ? 'video/webm'
        : url.toLowerCase().includes('.mov')
          ? 'video/quicktime'
          : 'video/mp4';

  const clearHideTimer = () => {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const scheduleHideUi = useCallback(() => {
    clearHideTimer();
    hideTimer.current = window.setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setShowUi(false);
    }, 2500);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    setPlaying(false);
    setProgress(0);
    return () => clearHideTimer();
  }, [url]);

  useEffect(() => {
    const onFs = () => {
      const el = containerRef.current;
      setFullscreen(Boolean(document.fullscreenElement === el));
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  async function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (v.paused) {
        await v.play();
        setPlaying(true);
        scheduleHideUi();
      } else {
        v.pause();
        setPlaying(false);
        setShowUi(true);
        clearHideTimer();
      }
    } catch {
      setError('Playback blocked. Tap again or check the video format (H.264 + AAC).');
    }
  }

  function toggleMute(e: React.MouseEvent) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  async function toggleFullscreen(e: React.MouseEvent) {
    e.stopPropagation();
    const box = containerRef.current;
    const v = videoRef.current;
    if (!box) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (box.requestFullscreen) {
        await box.requestFullscreen();
      } else if (v && 'webkitEnterFullscreen' in v) {
        // iOS Safari native fullscreen
        (v as HTMLVideoElement & { webkitEnterFullscreen: () => void }).webkitEnterFullscreen();
      }
    } catch {
      /* ignore */
    }
  }

  function onSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const v = videoRef.current;
    if (!v || !duration) return;
    const t = (Number(e.target.value) / 100) * duration;
    v.currentTime = t;
    setProgress(Number(e.target.value));
  }

  function formatTime(s: number) {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  return (
    <div
      ref={containerRef}
      className={`group relative w-full overflow-hidden bg-black ${className}`}
      onMouseMove={() => {
        setShowUi(true);
        if (playing) scheduleHideUi();
      }}
      onClick={() => {
        setShowUi(true);
        void togglePlay();
      }}
    >
      <video
        ref={videoRef}
        key={url}
        className="media-video-feed mx-auto block w-full bg-black"
        playsInline
        preload="metadata"
        muted={muted}
        controls={false}
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        onLoadStart={() => setLoading(true)}
        onWaiting={() => setLoading(true)}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          setDuration(v.duration || 0);
          // Seek slightly so a frame is painted as thumbnail before play
          if (v.readyState >= 1 && v.currentTime === 0) {
            try {
              v.currentTime = 0.05;
            } catch {
              /* ignore */
            }
          }
        }}
        onLoadedData={() => {
          setLoading(false);
          setError('');
        }}
        onCanPlay={() => setLoading(false)}
        onPlaying={() => {
          setLoading(false);
          setPlaying(true);
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          if (v.duration && Number.isFinite(v.duration)) {
            setProgress((v.currentTime / v.duration) * 100);
          }
        }}
        onEnded={() => {
          setPlaying(false);
          setShowUi(true);
          setProgress(100);
        }}
        onError={() => {
          setLoading(false);
          setError(
            'Video failed to play. Use MP4 (H.264 video + AAC audio). HEVC/H.265 is not supported in most browsers.',
          );
        }}
      >
        <source src={url} type={type} />
      </video>

      {/* Loading spinner */}
      {loading && !error ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/40">
          <Loader2 className="h-10 w-10 animate-spin text-white" aria-label="Loading video" />
        </div>
      ) : null}

      {/* Error */}
      {error ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 p-4 text-center">
          <p className="max-w-sm text-sm text-white/90">{error}</p>
        </div>
      ) : null}

      {/* Center play affordance when paused */}
      {!playing && !loading && !error ? (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white shadow-float backdrop-blur">
            <Play size={28} className="ml-1" fill="currentColor" />
          </div>
        </div>
      ) : null}

      {/* Controls bar */}
      {showUi && !error ? (
        <div
          className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-3 pt-10"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={progress}
            onChange={onSeek}
            className="mb-2 h-1 w-full cursor-pointer accent-white"
            aria-label="Seek"
          />
          <div className="flex items-center gap-2 text-white">
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
              onClick={(e) => {
                e.stopPropagation();
                void togglePlay();
              }}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
            </button>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
              onClick={toggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <span className="ml-1 text-[11px] tabular-nums text-white/90">
              {formatTime((progress / 100) * duration)} / {formatTime(duration)}
            </span>
            <button
              type="button"
              className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {fullscreen ? <Minimize2 size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
