import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import {
  compressImageIfNeeded,
  createPost,
  createReel,
  createStoryWithUpload,
  purposeForFile,
  uploadMedia,
  validateMediaFile,
} from '../../lib/social';
import type { PostVisibility } from '../../types/social';

const visibilityOptions: { value: PostVisibility; label: string }[] = [
  { value: 'DEPARTMENT', label: 'Department' },
  { value: 'FRIENDS', label: 'Friends only' },
  { value: 'PUBLIC', label: 'Public' },
  { value: 'PRIVATE', label: 'Only me' },
];

export function CreatePostPage() {
  const [searchParams] = useSearchParams();
  const contentType = searchParams.get('type'); // story | reel | post
  const isStory = contentType === 'story';
  const isReel = contentType === 'reel';
  const navigate = useNavigate();

  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('DEPARTMENT');
  const [preview, setPreview] = useState<string | null>(null);
  const [previewIsVideo, setPreviewIsVideo] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  async function handleFileChange(file: File | null) {
    if (!file) return;
    const context = isStory ? 'story' : 'post';
    const validationError = validateMediaFile(file, isReel ? 'post' : context);
    if (validationError) {
      setError(validationError);
      return;
    }

    if (preview) URL.revokeObjectURL(preview);
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setPreviewIsVideo(file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name));
    setError('');
  }

  async function handleSubmit() {
    setError('');
    setStatus('');

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

        // Single request: storage + PostgreSQL Story row (no orphan uploads)
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

        setStatus('Story saved! Opening feed…');
        // Persist a hint so Feed can show optimistically even if refetch races
        try {
          sessionStorage.setItem(
            'avichian_last_story',
            JSON.stringify({ id: story.id, at: Date.now() }),
          );
        } catch {
          /* ignore */
        }

        navigate('/home', {
          replace: true,
          state: { refreshStories: true, newStoryId: story.id, ts: Date.now() },
        });
        return;
      }

      if (isReel) {
        if (!selectedFile) {
          setError('Add a video for your reel');
          return;
        }
        if (!selectedFile.type.startsWith('video/') && !/\.(mp4|webm|mov)$/i.test(selectedFile.name)) {
          setError('Reels must be video (MP4, WebM, or MOV)');
          return;
        }
        setStatus('Uploading reel…');
        setUploadPercent(0);
        const uploaded = await uploadMedia(selectedFile, 'post_video', setUploadPercent);
        setStatus('Saving reel…');
        await createReel({
          mediaUrl: uploaded.url,
          caption: caption || undefined,
          visibility,
        });
        navigate('/home/reels', { replace: true });
        return;
      }

      // ── Posts (separate media upload + create is OK) ──
      if (!caption.trim() && !selectedFile) {
        setError('Add a caption or media');
        return;
      }

      let mediaUrl: string | undefined;
      if (selectedFile) {
        let file = selectedFile;
        if (file.type.startsWith('image/')) {
          file = await compressImageIfNeeded(file);
        }
        setStatus('Uploading media…');
        setUploadPercent(0);
        const uploaded = await uploadMedia(file, purposeForFile(file, 'post'), setUploadPercent);
        mediaUrl = uploaded.url;
      }

      setStatus('Publishing post…');
      await createPost({
        caption: caption.trim() || undefined,
        mediaUrl,
        visibility,
      });

      navigate('/home', {
        replace: true,
        state: { refreshStories: true, ts: Date.now() },
      });
    } catch (err) {
      console.error('[create]', err);
      setError(err instanceof Error ? err.message : 'Could not publish');
      setStatus('');
    } finally {
      setLoading(false);
      setUploadPercent(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl min-w-0 space-y-4">
      <div className="glass-card rounded-[28px] p-4 shadow-soft sm:p-6">
        <h1 className="text-fluid-xl font-bold text-slate-900">
          {isStory ? 'New story' : isReel ? 'New reel' : 'New post'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {isStory
            ? 'Stories disappear after 24 hours. Images up to 20MB, videos up to 500MB.'
            : isReel
              ? 'Short vertical videos for campus. Max 500MB (MP4 / WebM).'
              : 'Share with your campus community.'}
        </p>
      </div>

      <label
        className="glass-card block cursor-pointer rounded-[28px] p-6 text-center shadow-soft"
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
        <span className="text-sm font-medium text-slate-600">
          Tap to add photo or video · or drag &amp; drop
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
          className="hidden"
          onChange={(e) => void handleFileChange(e.target.files?.[0] ?? null)}
        />
        {preview ? (
          previewIsVideo ? (
            <video
              src={preview}
              controls
              playsInline
              preload="metadata"
              className="mx-auto mt-4 max-h-72 rounded-[20px] object-contain"
            />
          ) : (
            <img src={preview} alt="Preview" className="mx-auto mt-4 max-h-72 rounded-[20px] object-cover" />
          )
        ) : (
          <div className="mx-auto mt-4 flex h-40 w-full max-w-xs items-center justify-center rounded-[20px] border-2 border-dashed border-slate-200 text-slate-400">
            No media selected
          </div>
        )}
      </label>

      {uploadPercent !== null ? (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-500">
            <span>{status || 'Uploading…'}</span>
            <span>{uploadPercent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${uploadPercent}%` }}
            />
          </div>
        </div>
      ) : status ? (
        <p className="text-sm text-slate-500">{status}</p>
      ) : null}

      <label className="block space-y-2">
        <span className="text-sm font-medium text-slate-600">{isStory ? 'Caption (optional)' : 'Caption'}</span>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={4}
          maxLength={isStory ? 200 : 2000}
          placeholder={isStory ? 'Say something…' : 'What is on your mind?'}
          className="w-full rounded-[20px] border border-slate-200 bg-white/80 px-4 py-3 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </label>

      {!isStory ? (
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-600">Who can see this?</span>
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as PostVisibility)}
            className="min-h-12 w-full rounded-[20px] border border-slate-200 bg-white/80 px-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            {visibilityOptions.map((option) => (
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

      <Button loading={loading} onClick={() => void handleSubmit()}>
        {isStory ? 'Share story' : isReel ? 'Publish reel' : 'Publish post'}
      </Button>
    </div>
  );
}
