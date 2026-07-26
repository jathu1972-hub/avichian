import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { PostCard } from '../../components/student/PostCard';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import { fetchUserPosts, fileToDataUrl, toggleLike, updateMyProfile } from '../../lib/social';
import type { FeedPost } from '../../types/social';

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const [bio, setBio] = useState(user?.bio ?? '');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    fetchUserPosts(user.id)
      .then(setPosts)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load posts'))
      .finally(() => setLoading(false));
  }, [user]);

  async function handlePhotoChange(file: File | null) {
    if (!file || !user) return;
    try {
      setSaving(true);
      const profilePhotoUrl = await fileToDataUrl(file);
      const updated = await updateMyProfile({ profilePhotoUrl });
      setUser(updated);
      setMessage('Profile photo updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update photo');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveBio() {
    if (!user) return;
    try {
      setSaving(true);
      setError('');
      const updated = await updateMyProfile({ bio });
      setUser(updated);
      setMessage('Bio saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save bio');
    } finally {
      setSaving(false);
    }
  }

  async function handleLike(postId: string) {
    try {
      setLikingId(postId);
      const result = await toggleLike(postId);
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? { ...post, likedByMe: result.liked, likeCount: result.likeCount }
            : post,
        ),
      );
    } finally {
      setLikingId(null);
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="glass-card rounded-[28px] p-6 shadow-soft">
        <div className="flex items-start gap-4">
          <label className="relative cursor-pointer">
            <StudentAvatar name={user.name} photoUrl={user.profilePhotoUrl} size="lg" ring />
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-slate-900">{user.name}</h1>
            <p className="text-sm text-slate-500">
              {user.regNo} · {user.department}
              {user.year ? ` · ${user.year}` : ''}
            </p>
            <p className="mt-3 text-sm text-slate-600">{user.email}</p>
          </div>
        </div>

        <label className="mt-4 block space-y-2">
          <span className="text-sm font-medium text-slate-600">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            maxLength={300}
            className="w-full rounded-[20px] border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </label>

        <Button className="mt-3" loading={saving} onClick={handleSaveBio}>
          Save profile
        </Button>

        {message ? <p className="mt-2 text-sm text-success">{message}</p> : null}
        {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Your posts</h2>
        {loading ? <p className="text-sm text-slate-500">Loading posts…</p> : null}
        {!loading && posts.length === 0 ? (
          <p className="text-sm text-slate-500">You have not posted yet.</p>
        ) : (
          posts.map((post) => (
            <PostCard key={post.id} post={post} onLike={handleLike} liking={likingId === post.id} />
          ))
        )}
      </div>
    </div>
  );
}