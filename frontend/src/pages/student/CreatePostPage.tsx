import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { createPost, createStory, fileToDataUrl } from '../../lib/social';
import type { PostVisibility } from '../../types/social';

const visibilityOptions: { value: PostVisibility; label: string }[] = [
  { value: 'DEPARTMENT', label: 'Department' },
  { value: 'FRIENDS', label: 'Friends only' },
  { value: 'PUBLIC', label: 'Public' },
  { value: 'PRIVATE', label: 'Only me' },
];

export function CreatePostPage() {
  const [searchParams] = useSearchParams();
  const isStory = searchParams.get('type') === 'story';
  const navigate = useNavigate();

  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<PostVisibility>('DEPARTMENT');
  const [preview, setPreview] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleFileChange(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file');
      return;
    }
    const dataUrl = await fileToDataUrl(file);
    setPreview(dataUrl);
    setMediaUrl(dataUrl);
    setError('');
  }

  async function handleSubmit() {
    try {
      setLoading(true);
      setError('');

      if (isStory) {
        if (!mediaUrl) {
          setError('Add a photo for your story');
          return;
        }
        await createStory({ mediaUrl, caption: caption || undefined });
      } else {
        if (!caption.trim() && !mediaUrl) {
          setError('Add a caption or photo');
          return;
        }
        await createPost({
          caption: caption.trim() || undefined,
          mediaUrl: mediaUrl ?? undefined,
          visibility,
        });
      }

      navigate('/home');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-[28px] p-6 shadow-soft">
        <h1 className="text-xl font-bold text-slate-900">{isStory ? 'New story' : 'New post'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isStory ? 'Stories disappear after 24 hours.' : 'Share with your campus community.'}
        </p>
      </div>

      <label className="glass-card block cursor-pointer rounded-[28px] p-6 text-center shadow-soft">
        <span className="text-sm font-medium text-slate-600">Tap to add photo</span>
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
        />
        {preview ? (
          <img src={preview} alt="Preview" className="mx-auto mt-4 max-h-72 rounded-[20px] object-cover" />
        ) : (
          <div className="mx-auto mt-4 flex h-40 w-full max-w-xs items-center justify-center rounded-[20px] border-2 border-dashed border-slate-200 text-slate-400">
            No image selected
          </div>
        )}
      </label>

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

      {error ? <p className="text-sm text-error">{error}</p> : null}

      <Button loading={loading} onClick={handleSubmit}>
        {isStory ? 'Share story' : 'Publish post'}
      </Button>
    </div>
  );
}