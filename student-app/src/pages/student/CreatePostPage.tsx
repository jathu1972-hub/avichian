import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Clapperboard,
  ImagePlus,
  CircleDot,
  Loader2,
  Trash2,
  Upload,
  CheckCircle2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import {
  compressImageIfNeeded,
  createPost,
  createReelWithUpload,
  createStoryWithUpload,
  purposeForFile,
  uploadMedia,
  validateMediaFile,
} from '../../lib/social';
import type { PostVisibility } from '../../types/social';

const visibilityOptions: { value: PostVisibility; label: string }[] = [
  { value: 'PUBLIC', label: 'Public · campus' },
  { value: 'FRIENDS', label: 'Friends only' },
  { value: 'DEPARTMENT', label: 'Department' },
  { value: 'PRIVATE', label: 'Private · only me' },
];

const reelVisibilityOptions: { value: PostVisibility | 'CAMPUS'; label: string }[] = [
  { value: 'PUBLIC', label: 'Campus (everyone)' },
  { value: 'DEPARTMENT', label: 'Department' },
  { value: 'FRIENDS', label: 'Friends only' },
  { value: 'PRIVATE', label: 'Private' },
];

type Kind = 'post' | 'reel' | 'story';

function resolveKind(param?: string, query?: string | null): Kind {
  const raw = (param || query || 'post').toLowerCase();
  if (raw === 'reel' || raw === 'story' || raw === 'post') return raw;
  return 'post';
}

const meta: Record<
  Kind,
  {
    title: string;
    subtitle: string;
    accent: string;
    icon: typeof ImagePlus;
    publish: string;
  }
> = {
  post: {
    title: 'New post',
    subtitle: 'Photos, videos & captions for your feed',
    accent: 'from-sky-500 to-indigo-600',
    icon: ImagePlus,
    publish: 'Publish post',
  },
  reel: {
    title: 'New reel',
    subtitle: 'Short vertical video · MP4 H.264 · max 90s · 100MB',
    accent: 'from-fuchsia-500 to-orange-400',
    icon: Clapperboard,
    publish: 'Publish reel',
  },
  story: {
    title: 'New story',
    subtitle: 'Visible for 24 hours · images 20MB · video up to 500MB',
    accent: 'from-violet-500 to-pink-500',
    icon: CircleDot,
    publish: 'Share story',
  },
};

export function CreatePostPage() {
  const { kind: kindParam } = useParams();
  const [searchParams] = useSearchParams();
  const kind = resolveKind(kindParam, searchParams.get('type'));
  const isStory = kind === 'story';
  const isReel = kind === 'reel';
  const navigate = useNavigate();
  const m = meta[kind];
  const Icon = m.icon;

  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [audioName, setAudioName] = useState('Original audio');
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [visibility, setVisibility] = useState<PostVisibility>(
    isStory ? 'DEPARTMENT' : isReel ? 'PUBLIC' : 'DEPARTMENT',
  );
  const [preview, setPreview] = useState<string | null>(null);
  const [previewIsVideo, setPreviewIsVideo] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
      if (coverPreview) URL.revokeObjectURL(coverPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearMedia() {
    if (preview) URL.revokeObjectURL(preview);
    setSelectedFile(null);
    setPreview(null);
    setPreviewIsVideo(false);
    setDurationSec(null);
  }

  async function handleFileChange(file: File | null) {
    if (!file) return;
    const context = isStory ? 'story' : 'post';
    const validationError = validateMediaFile(file, isReel ? 'post' : context);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (isReel) {
      if (!file.type.startsWith('video/') && !/\.(mp4|webm)$/i.test(file.name)) {
        setError('Reels must be MP4 (H.264) or WebM');
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        setError('Reels must be 100MB or smaller');
        return;
      }
    }

    if (preview) URL.revokeObjectURL(preview);
    setSelectedFile(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
    setPreviewIsVideo(file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name));
    setDurationSec(null);
    setError('');

    if (isReel || file.type.startsWith('video/')) {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => {
        window.URL.revokeObjectURL(v.src);
        const d = Math.round(v.duration);
        setDurationSec(d);
        if (isReel && d > 90) {
          setError('Reels must be 90 seconds or shorter');
          setSelectedFile(null);
          setPreview(null);
        }
      };
      v.src = url;
    }
  }

  function handleCoverChange(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Cover must be an image');
      return;
    }
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverFile(file);
    setCoverPreview(URL.createObjectURL(file));
  }

  async function handleSubmit() {
    setError('');
    setStatus('');
    setSuccess(false);

    try {
      setLoading(true);
      setUploadPercent(null);

      if (isStory) {
        if (!selectedFile) {
          setError('Add a photo or video for your story');
          return;
        }

        let file = selectedFile;
        if (file.type.startsWith('image/')) {
          setStatus('Compressing image…');
          file = await compressImageIfNeeded(file);
        }

        setStatus('Uploading and saving story…');
        setUploadPercent(0);
        const story = await createStoryWithUpload(file, {
          caption: caption || undefined,
          visibility: 'DEPARTMENT',
          onProgress: setUploadPercent,
        });

        if (!story?.id) {
          throw new Error('Story was not created in the database');
        }

        setSuccess(true);
        setStatus('Story saved!');
        try {
          sessionStorage.setItem(
            'avichian_last_story',
            JSON.stringify({ id: story.id, at: Date.now() }),
          );
        } catch {
          /* ignore */
        }

        setTimeout(() => {
          navigate('/home', {
            replace: true,
            state: { refreshStories: true, newStoryId: story.id, ts: Date.now() },
          });
        }, 450);
        return;
      }

      if (isReel) {
        if (!selectedFile) {
          setError('Add a video for your reel');
          return;
        }
        if (durationSec != null && durationSec > 90) {
          setError('Reels must be 90 seconds or shorter');
          return;
        }
        if (selectedFile.size > 100 * 1024 * 1024) {
          setError('Reels must be 100MB or smaller');
          return;
        }
        setStatus('Uploading reel…');
        setUploadPercent(0);
        await createReelWithUpload({
          video: selectedFile,
          cover: coverFile,
          caption: caption || undefined,
          hashtags: hashtags || undefined,
          audioName: audioName || undefined,
          durationSec: durationSec ?? undefined,
          visibility,
          onProgress: setUploadPercent,
        });
        setSuccess(true);
        setStatus('Reel published!');
        setTimeout(() => navigate('/home/reels', { replace: true }), 450);
        return;
      }

      if (!caption.trim() && !selectedFile) {
        setError('Add a caption or media');
        return;
      }

      let mediaUrl: string | undefined;
      let mediaMimeType: string | undefined;
      if (selectedFile) {
        let file = selectedFile;
        if (file.type.startsWith('image/')) {
          file = await compressImageIfNeeded(file);
        }
        setStatus('Uploading media…');
        setUploadPercent(0);
        const uploaded = await uploadMedia(file, purposeForFile(file, 'post'), setUploadPercent);
        mediaUrl = uploaded.url;
        mediaMimeType = uploaded.mimeType;
      }

      setStatus('Publishing post…');
      await createPost({
        caption: caption.trim() || undefined,
        mediaUrl,
        mediaMimeType,
        visibility,
      });

      setSuccess(true);
      setStatus('Post published!');
      setTimeout(() => {
        navigate('/home', {
          replace: true,
          state: { refreshStories: true, ts: Date.now() },
        });
      }, 450);
    } catch (err) {
      console.error('[create]', err);
      setError(err instanceof Error ? err.message : 'Could not publish');
      setStatus('');
      setSuccess(false);
    } finally {
      setLoading(false);
      setUploadPercent(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className="mx-auto w-full max-w-xl min-w-0 space-y-4 pb-8"
    >
      {/* Header */}
      <div
        className={`relative overflow-hidden rounded-[28px] bg-gradient-to-br ${m.accent} p-[1px] shadow-float`}
      >
        <div className="rounded-[27px] bg-white/95 px-4 py-4 backdrop-blur-xl dark:bg-slate-950/90 sm:px-5">
          <div className="flex items-start gap-3">
            <Link
              to="/home/create"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
              aria-label="Back to create"
            >
              <ArrowLeft size={18} />
            </Link>
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${m.accent} text-white shadow-lg`}
            >
              <Icon size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                Create · {kind}
              </p>
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                {m.title}
              </h1>
              <p className="mt-0.5 text-xs leading-snug text-slate-500">{m.subtitle}</p>
              {isReel && durationSec != null ? (
                <p className="mt-1 text-[11px] font-medium text-slate-400">Duration: {durationSec}s</p>
              ) : null}
              {isStory ? (
                <p className="mt-1 text-[11px] font-semibold text-violet-600 dark:text-violet-300">
                  ⏱ Visible for 24 hours
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Media drop zone */}
      <div
        className={`glass-card relative overflow-hidden rounded-[28px] shadow-soft ${
          isReel ? 'bg-gradient-to-b from-fuchsia-500/5 to-transparent dark:from-fuchsia-500/10' : ''
        }`}
      >
        <label
          className="block cursor-pointer p-5 text-center sm:p-6"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            void handleFileChange(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <input
            type="file"
            accept={
              isReel
                ? 'video/mp4,video/webm'
                : 'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime'
            }
            className="hidden"
            onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
          />

          {preview ? (
            <div className="relative mx-auto max-w-sm">
              {previewIsVideo ? (
                <video
                  src={preview}
                  controls
                  playsInline
                  preload="metadata"
                  className={`mx-auto max-h-80 rounded-[22px] object-contain ${
                    isReel ? 'aspect-[9/16] max-h-[min(70dvh,28rem)] w-full bg-black object-cover' : ''
                  }`}
                />
              ) : (
                <img
                  src={preview}
                  alt="Preview"
                  className="mx-auto max-h-80 rounded-[22px] object-cover shadow-soft"
                />
              )}
            </div>
          ) : (
            <div
              className={`mx-auto flex min-h-[11rem] w-full max-w-sm flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-slate-200 bg-slate-50/80 px-4 dark:border-slate-700 dark:bg-slate-800/40 ${
                isReel ? 'min-h-[16rem] border-fuchsia-200/60 dark:border-fuchsia-900/40' : ''
              } ${isStory ? 'min-h-[14rem] border-violet-200/60' : ''}`}
            >
              <div
                className={`mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${m.accent} text-white shadow-lg`}
              >
                <Upload size={24} />
              </div>
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {isReel ? 'Tap to add video' : 'Tap to add photo or video'}
              </p>
              <p className="mt-1 text-xs text-slate-400">or drag & drop here</p>
            </div>
          )}
        </label>

        {preview ? (
          <div className="flex justify-center gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            <label className="cursor-pointer rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              Change
              <input
                type="file"
                accept={
                  isReel
                    ? 'video/mp4,video/webm'
                    : 'image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime'
                }
                className="hidden"
                onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              onClick={clearMedia}
              className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-600 dark:bg-rose-950"
            >
              <Trash2 size={12} /> Remove
            </button>
          </div>
        ) : null}
      </div>

      {/* Progress */}
      {uploadPercent !== null ? (
        <div className="glass-card space-y-2 rounded-[22px] p-4 shadow-soft">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              {status || 'Uploading…'}
            </span>
            <span className="font-semibold tabular-nums">{uploadPercent}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${m.accent}`}
              initial={{ width: 0 }}
              animate={{ width: `${uploadPercent}%` }}
              transition={{ ease: 'easeOut', duration: 0.2 }}
            />
          </div>
        </div>
      ) : status ? (
        <p
          className={`flex items-center justify-center gap-2 text-sm font-medium ${
            success ? 'text-emerald-600' : 'text-slate-500'
          }`}
        >
          {success ? <CheckCircle2 size={16} /> : null}
          {status}
        </p>
      ) : null}

      {/* Reel cover */}
      {isReel ? (
        <label className="glass-card block cursor-pointer rounded-[24px] p-4 text-center shadow-soft">
          <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Cover image (optional)
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleCoverChange(e.target.files?.[0] ?? null)}
          />
          {coverPreview ? (
            <img
              src={coverPreview}
              alt="Cover"
              className="mx-auto mt-3 max-h-36 rounded-2xl object-cover shadow-soft"
            />
          ) : (
            <p className="mt-2 text-xs text-slate-400">Tap to choose thumbnail</p>
          )}
        </label>
      ) : null}

      {/* Caption */}
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
          {isStory ? 'Caption (optional)' : 'Caption'}
        </span>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={isReel ? 3 : isStory ? 2 : 4}
          maxLength={isStory ? 200 : isReel ? 500 : 2000}
          placeholder={
            isStory ? 'Say something…' : isReel ? 'Describe your reel…' : 'What is on your mind?'
          }
          className="w-full rounded-[22px] border border-slate-200/80 bg-white/90 px-4 py-3 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
        />
      </label>

      {isReel ? (
        <>
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Hashtags</span>
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="#campus #fest #vcom"
              className="min-h-12 w-full rounded-[22px] border border-slate-200/80 bg-white/90 px-4 text-base outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Audio name</span>
            <input
              value={audioName}
              onChange={(e) => setAudioName(e.target.value)}
              className="min-h-12 w-full rounded-[22px] border border-slate-200/80 bg-white/90 px-4 text-base outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
            />
          </label>
        </>
      ) : null}

      {!isStory ? (
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Who can see this?
          </span>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as PostVisibility)}
            className="min-h-12 w-full rounded-[22px] border border-slate-200/80 bg-white/90 px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 dark:border-slate-700 dark:bg-slate-900/80 dark:text-white"
          >
            {(isReel ? reelVisibilityOptions : visibilityOptions).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {error ? (
        <p className="rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          to="/home/create"
          className="order-2 flex min-h-12 flex-1 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:order-1"
        >
          Cancel
        </Link>
        <motion.div className="order-1 flex-1 sm:order-2" whileTap={{ scale: 0.98 }}>
          <Button
            loading={loading}
            onClick={() => void handleSubmit()}
            className={`!rounded-full !bg-gradient-to-r ${m.accent} !shadow-float`}
          >
            {m.publish}
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
