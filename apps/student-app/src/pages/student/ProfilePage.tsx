import { Settings, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { PostCard } from '../../components/student/PostCard';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import {
  compressImageIfNeeded,
  fetchUserPosts,
  toggleLike,
  updateMyProfile,
  uploadCoverPhoto,
  uploadProfilePhoto,
  validateMediaFile,
} from '../../lib/social';
import type { FeedPost } from '../../types/social';

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const [bio, setBio] = useState(user?.bio ?? '');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
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
    const validationError = validateMediaFile(file, 'profile');
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      setSaving(true);
      setError('');
      setUploadPercent(0);
      const compressed = await compressImageIfNeeded(file, 1024, 0.85);
      const uploaded = await uploadProfilePhoto(compressed, setUploadPercent);
      if (uploaded.user) {
        setUser(uploaded.user);
      } else {
        const updated = await updateMyProfile({ profilePhotoUrl: uploaded.url });
        setUser(updated);
      }
      setMessage('Profile photo updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update photo');
    } finally {
      setSaving(false);
      setUploadPercent(null);
    }
  }

  async function handleCoverChange(file: File | null) {
    if (!file || !user) return;
    const validationError = validateMediaFile(file, 'cover');
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      setSaving(true);
      setError('');
      setUploadPercent(0);
      const compressed = await compressImageIfNeeded(file, 1920, 0.82);
      const uploaded = await uploadCoverPhoto(compressed, setUploadPercent);
      if (uploaded.user) {
        setUser(uploaded.user);
      } else {
        const updated = await updateMyProfile({ coverPhotoUrl: uploaded.url });
        setUser(updated);
      }
      setMessage('Cover photo updated');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update cover');
    } finally {
      setSaving(false);
      setUploadPercent(null);
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

  const coverUrl = (user as { coverPhotoUrl?: string | null }).coverPhotoUrl;

  return (
    <div className="mx-auto w-full max-w-3xl min-w-0 space-y-4">
      <div className="glass-card overflow-hidden rounded-[28px] shadow-soft">
        <label className="relative block h-28 cursor-pointer bg-gradient-to-r from-primary via-indigo-500 to-violet-600 sm:h-36 md:h-40">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="media-cover h-full w-full" />
          ) : null}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleCoverChange(e.target.files?.[0] ?? null)}
          />
          <span className="absolute bottom-2 right-3 rounded-full bg-black/50 px-2 py-1 text-[10px] text-white">
            Change cover
          </span>
        </label>

        <div className="p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            <label className="relative -mt-12 w-fit shrink-0 cursor-pointer sm:-mt-14">
              <StudentAvatar name={user.name} photoUrl={user.profilePhotoUrl} size="lg" ring />
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => handlePhotoChange(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="min-w-0 flex-1 sm:pb-1">
              <h1 className="text-fluid-xl font-bold text-slate-900 break-anywhere">{user.name}</h1>
              <p className="text-fluid-sm text-slate-500 break-anywhere">
                {user.regNo} · {user.department}
                {user.year ? ` · ${user.year}` : ''}
              </p>
              <p className="mt-2 text-sm text-slate-600 break-anywhere sm:mt-3">{user.email}</p>
            </div>
            <div className="grid w-full grid-cols-3 gap-2 sm:w-auto sm:min-w-[14rem]">
              <div className="rounded-2xl bg-slate-50 px-2 py-3 text-center">
                <p className="font-bold text-slate-900">{posts.length}</p>
                <p className="text-[11px] text-slate-500">Posts</p>
              </div>
              <Link to="/home/friends" className="rounded-2xl bg-slate-50 px-2 py-3 text-center">
                <Users size={16} className="mx-auto text-primary" />
                <p className="mt-1 text-[11px] text-slate-500">Friends</p>
              </Link>
              <Link to="/home/settings" className="rounded-2xl bg-slate-50 px-2 py-3 text-center">
                <Settings size={16} className="mx-auto text-primary" />
                <p className="mt-1 text-[11px] text-slate-500">Settings</p>
              </Link>
            </div>
          </div>

          {uploadPercent !== null ? (
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Uploading…</span>
                <span>{uploadPercent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
            </div>
          ) : null}

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

            {message ? <p className="mt-3 text-sm text-success">{message}</p> : null}
          {error ? <p className="mt-2 break-anywhere text-sm text-error">{error}</p> : null}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-fluid-lg font-semibold text-slate-900">Your posts</h2>
        {loading ? <p className="text-sm text-slate-500">Loading posts…</p> : null}
        {!loading && posts.length === 0 ? (
          <p className="text-sm text-slate-500">You have not posted yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onLike={handleLike}
                liking={likingId === post.id}
                onRemoved={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
                onUpdated={(updated) =>
                  setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
                }
                toast={(msg) => setMessage(msg)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
