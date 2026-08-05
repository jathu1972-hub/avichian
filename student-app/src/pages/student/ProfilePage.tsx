import { AnimatePresence, motion } from 'framer-motion';
import {
  BadgeCheck,
  Bookmark,
  Camera,
  Clapperboard,
  Grid3X3,
  Image as ImageIcon,
  MoreHorizontal,
  Settings,
  Share2,
  User,
  UserPlus,
  Users,
  UsersRound,
  X,
  Sparkles,
  Plus,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { PostCard } from '../../components/student/PostCard';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import {
  compressImageIfNeeded,
  fetchFriends,
  fetchSavedReels,
  fetchStories,
  fetchUserPosts,
  fetchUserReels,
  toggleLike,
  updateMyProfile,
  uploadCoverPhoto,
  uploadProfilePhoto,
  validateMediaFile,
  type ReelItem,
} from '../../lib/social';
import { fetchCommunities } from '../../lib/communities';
import type { FeedPost, StoryGroup, StoryItem, StudentSummary } from '../../types/social';
import { resolveMediaUrl } from '../../lib/config';

async function loadJoinedCommunities() {
  try {
    const data = await fetchCommunities({ filter: 'joined' });
    return data.items ?? [];
  } catch {
    return [];
  }
}

type ProfileTab =
  | 'posts'
  | 'reels'
  | 'stories'
  | 'saved'
  | 'about'
  | 'friends'
  | 'communities';

const TABS: { id: ProfileTab; label: string; icon: typeof Grid3X3 }[] = [
  { id: 'posts', label: 'Posts', icon: Grid3X3 },
  { id: 'reels', label: 'Reels', icon: Clapperboard },
  { id: 'stories', label: 'Stories', icon: Sparkles },
  { id: 'saved', label: 'Saved', icon: Bookmark },
  { id: 'about', label: 'About', icon: User },
  { id: 'friends', label: 'Friends', icon: Users },
  { id: 'communities', label: 'Groups', icon: UsersRound },
];

function AnimatedCount({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let frame = 0;
    const target = value;
    const steps = 12;
    const id = window.setInterval(() => {
      frame += 1;
      setDisplay(Math.round((target * frame) / steps));
      if (frame >= steps) window.clearInterval(id);
    }, 30);
    return () => window.clearInterval(id);
  }, [value]);
  return <span>{display}</span>;
}

export function ProfilePage() {
  const { user, setUser } = useAuth();
  const [bio, setBio] = useState(user?.bio ?? '');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [saved, setSaved] = useState<ReelItem[]>([]);
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [friends, setFriends] = useState<StudentSummary[]>([]);
  const [communities, setCommunities] = useState<
    Array<{ id: string; name: string; memberCount: number; description?: string; iconUrl?: string | null }>
  >([]);
  const [tab, setTab] = useState<ProfileTab>('posts');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; label: string } | null>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    if (!user) return;
    setBio(user.bio ?? '');
    setLoading(true);
    Promise.all([
      fetchUserPosts(user.id),
      fetchUserReels(user.id),
      fetchSavedReels(),
      fetchFriends().catch(() => [] as StudentSummary[]),
      fetchStories().catch(() => [] as StoryGroup[]),
      loadJoinedCommunities(),
    ])
      .then(([p, r, s, f, storyGroups, comms]) => {
        setPosts(p);
        setReels(r);
        setSaved(s);
        setFriends(f);
        const mine = (storyGroups as StoryGroup[]).find((g) => g.user.id === user.id);
        setStories(mine?.stories ?? []);
        setCommunities(
          comms.map((c) => ({
            id: c.id,
            name: c.name,
            memberCount: c.memberCount,
            description: c.description,
            iconUrl: c.iconUrl,
          })),
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load profile'))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => {
    const bar = tabBarRef.current;
    if (!bar) return;
    const active = bar.querySelector<HTMLButtonElement>(`[data-tab="${tab}"]`);
    if (!active) return;
    setIndicator({ left: active.offsetLeft, width: active.offsetWidth });
  }, [tab, loading]);

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
      if (uploaded.user) setUser(uploaded.user);
      else setUser(await updateMyProfile({ profilePhotoUrl: uploaded.url }));
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
      if (uploaded.user) setUser(uploaded.user);
      else setUser(await updateMyProfile({ coverPhotoUrl: uploaded.url }));
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
      setMessage('Profile saved');
      setEditOpen(false);
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

  function shareProfile() {
    const url = window.location.href;
    if (navigator.share) {
      void navigator.share({ title: user?.name ?? 'AVICHIAN Profile', url }).catch(() => undefined);
    } else {
      void navigator.clipboard.writeText(url).then(() => setMessage('Profile link copied'));
    }
  }

  const coverUrl = resolveMediaUrl(user?.coverPhotoUrl) ?? user?.coverPhotoUrl;
  const photoUrl = resolveMediaUrl(user?.profilePhotoUrl) ?? user?.profilePhotoUrl;

  const stats = useMemo(
    () => [
      { label: 'Posts', value: posts.length, onClick: () => setTab('posts') },
      { label: 'Reels', value: reels.length, onClick: () => setTab('reels') },
      { label: 'Stories', value: stories.length, onClick: () => setTab('stories') },
      { label: 'Friends', value: friends.length, onClick: () => setTab('friends') },
      { label: 'Groups', value: communities.length, onClick: () => setTab('communities') },
    ],
    [posts.length, reels.length, stories.length, friends.length, communities.length],
  );

  if (!user) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto w-full max-w-3xl min-w-0 space-y-4 pb-10"
    >
      {/* Header bar */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-lg font-bold text-slate-900 dark:text-white sm:text-xl">
            Profile
          </h1>
          <p className="text-xs text-slate-400">Your campus identity</p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            to="/home/search"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-soft dark:bg-slate-800"
            aria-label="Search"
          >
            <UserPlus size={18} />
          </Link>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-soft dark:bg-slate-800"
              aria-label="More"
            >
              <MoreHorizontal size={18} />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 top-11 z-30 min-w-[160px] rounded-2xl border border-slate-100 bg-white/95 p-1 shadow-float backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => {
                    setMenuOpen(false);
                    shareProfile();
                  }}
                >
                  <Share2 size={14} /> Share profile
                </button>
                <Link
                  to="/home/settings"
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
                  onClick={() => setMenuOpen(false)}
                >
                  <Settings size={14} /> Settings
                </Link>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className="rounded-full bg-gradient-to-r from-primary to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-float"
          >
            Edit profile
          </button>
        </div>
      </div>

      {/* Hero card — premium social header */}
      <div className="relative overflow-hidden rounded-[28px] bg-white/90 shadow-float ring-1 ring-slate-100/80 dark:bg-slate-900/70 dark:ring-slate-800">
        {/* Cover */}
        <div className="group relative h-40 bg-gradient-to-br from-primary via-indigo-500 to-violet-600 sm:h-48 md:h-56">
          {coverUrl ? (
            <button
              type="button"
              className="absolute inset-0 h-full w-full"
              onClick={() => setLightbox({ src: coverUrl, label: 'Cover photo' })}
            >
              <img src={coverUrl} alt="" className="h-full w-full object-cover" />
            </button>
          ) : (
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.28),transparent_55%)]" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 to-transparent" />
          <label className="absolute bottom-3 right-3 z-10 flex cursor-pointer items-center gap-1.5 rounded-full bg-black/50 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur transition hover:bg-black/65">
            <Camera size={12} /> Cover
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void handleCoverChange(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="px-4 pb-5 pt-0 sm:px-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-3">
              <div className="relative -mt-14 sm:-mt-16">
                <button
                  type="button"
                  onClick={() =>
                    photoUrl
                      ? setLightbox({ src: photoUrl, label: 'Profile photo' })
                      : undefined
                  }
                  className="block rounded-full bg-white p-1 shadow-float ring-2 ring-white dark:bg-slate-900 dark:ring-slate-900"
                >
                  <StudentAvatar name={user.name} photoUrl={user.profilePhotoUrl} size="lg" ring />
                </button>
                <label className="absolute bottom-1 right-1 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-primary text-white shadow-float ring-2 ring-white dark:ring-slate-900">
                  <Camera size={15} />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => void handlePhotoChange(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="font-display text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
                    {user.name}
                  </h2>
                  {(user as { verifiedBadge?: boolean }).verifiedBadge ? (
                    <BadgeCheck size={18} className="text-primary" />
                  ) : null}
                </div>
                <p className="text-sm font-medium text-slate-500">
                  {user.department}
                  {user.year ? ` · Year ${user.year}` : ''}
                </p>
                <p className="mt-0.5 font-mono text-xs text-slate-400">{user.regNo}</p>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs">
                  {user.online ? (
                    <>
                      <span className="h-2 w-2 rounded-full bg-success shadow-[0_0_0_3px_rgba(34,197,94,0.25)]" />
                      <span className="font-medium text-success">Online</span>
                    </>
                  ) : (
                    <span className="text-slate-400">Offline</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {user.bio ? (
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{user.bio}</p>
          ) : (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="mt-3 text-sm font-medium text-primary"
            >
              Add a bio…
            </button>
          )}

          {uploadPercent !== null ? (
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Uploading…</span>
                <span>{uploadPercent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-indigo-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${uploadPercent}%` }}
                />
              </div>
            </div>
          ) : null}

          {message ? <p className="mt-2 text-sm text-success">{message}</p> : null}
          {error ? <p className="mt-2 text-sm text-error">{error}</p> : null}

          {/* Stats */}
          <div className="mt-5 grid grid-cols-5 gap-1.5 sm:gap-2">
            {stats.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={s.onClick}
                className="rounded-2xl bg-slate-50/90 px-1 py-3 text-center transition hover:bg-primary/5 dark:bg-slate-800/80"
              >
                <p className="font-display text-base font-bold text-slate-900 dark:text-white sm:text-lg">
                  <AnimatedCount value={s.value} />
                </p>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400 sm:text-[10px]">
                  {s.label}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="relative">
        <div
          ref={tabBarRef}
          className="flex gap-1 overflow-x-auto rounded-full bg-slate-100/90 p-1 scrollbar-none dark:bg-slate-800/80"
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                data-tab={t.id}
                onClick={() => setTab(t.id)}
                className={`relative z-10 flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  active ? 'text-slate-900 dark:text-white' : 'text-slate-500'
                }`}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
          <motion.div
            className="absolute bottom-1 top-1 rounded-full bg-white shadow-soft dark:bg-slate-700"
            animate={{ left: indicator.left, width: indicator.width }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            style={{ zIndex: 0 }}
          />
        </div>
      </div>

      {/* Tab content */}
      <div className="min-h-[12rem]">
        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="aspect-square animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : null}

        {!loading && tab === 'posts' ? (
          posts.length === 0 ? (
            <Empty
              icon={<ImageIcon size={28} />}
              title="No posts yet"
              body="Share photos and updates with campus."
              action={{ to: '/home/create/post', label: 'Create post' }}
            />
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
          )
        ) : null}

        {!loading && tab === 'reels' ? (
          reels.length === 0 ? (
            <Empty
              icon={<Clapperboard size={28} />}
              title="No reels yet"
              body="Create a short vertical video."
              action={{ to: '/home/create/reel', label: 'Create reel' }}
            />
          ) : (
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {reels.map((r) => (
                <ReelThumb key={r.id} reel={r} />
              ))}
            </div>
          )
        ) : null}

        {!loading && tab === 'saved' ? (
          saved.length === 0 ? (
            <Empty
              icon={<Bookmark size={28} />}
              title="Nothing saved"
              body="Save reels to find them here later."
              action={{ to: '/home/reels', label: 'Browse reels' }}
            />
          ) : (
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {saved.map((r) => (
                <ReelThumb key={r.id} reel={r} />
              ))}
            </div>
          )
        ) : null}

        {!loading && tab === 'stories' ? (
          stories.length === 0 ? (
            <Empty
              icon={<Sparkles size={28} />}
              title="No active stories"
              body="Stories expire after 24 hours."
              action={{ to: '/home/create/story', label: 'Add story' }}
            />
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {stories.map((s) => {
                const url = resolveMediaUrl(s.mediaUrl) ?? s.mediaUrl;
                const video =
                  s.mediaType === 'VIDEO' || /\.(mp4|webm|mov)/i.test(s.mediaUrl || '');
                return (
                  <div
                    key={s.id}
                    className="relative aspect-[9/16] overflow-hidden rounded-2xl bg-slate-900 shadow-soft"
                  >
                    {video ? (
                      <video src={url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                    ) : (
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    )}
                    <span className="absolute bottom-1 left-1 rounded bg-black/50 px-1.5 py-0.5 text-[9px] text-white">
                      24h
                    </span>
                  </div>
                );
              })}
            </div>
          )
        ) : null}

        {!loading && tab === 'about' ? (
          <div className="glass-card space-y-4 rounded-[24px] p-5 shadow-soft dark:bg-slate-900/50">
            <Row label="Name" value={user.name} />
            <Row label="Register No" value={user.regNo} />
            <Row label="Email" value={user.email} />
            <Row label="Department" value={user.department} />
            <Row label="Year" value={user.year ? String(user.year) : '—'} />
            <Row label="Bio" value={user.bio || '—'} />
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="w-full rounded-full bg-primary/10 py-3 text-sm font-semibold text-primary"
            >
              Edit about
            </button>
          </div>
        ) : null}

        {!loading && tab === 'friends' ? (
          friends.length === 0 ? (
            <Empty
              icon={<Users size={28} />}
              title="No friends yet"
              body="Find classmates and send friend requests."
              action={{ to: '/home/search', label: 'Search students' }}
            />
          ) : (
            <div className="space-y-2">
              {friends.map((f) => (
                <Link
                  key={f.id}
                  to={`/home/user/${f.id}`}
                  className="glass-card flex items-center gap-3 rounded-[20px] p-3 shadow-soft dark:bg-slate-900/50"
                >
                  <StudentAvatar name={f.name} photoUrl={f.profilePhotoUrl} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900 dark:text-white">{f.name}</p>
                    <p className="text-xs text-slate-400">
                      {f.regNo} · {f.department}
                    </p>
                  </div>
                </Link>
              ))}
              <Link
                to="/home/friends"
                className="block text-center text-sm font-semibold text-primary"
              >
                Manage friends →
              </Link>
            </div>
          )
        ) : null}

        {!loading && tab === 'communities' ? (
          communities.length === 0 ? (
            <Empty
              icon={<UsersRound size={28} />}
              title="No communities joined"
              body="Explore clubs and campus groups."
              action={{ to: '/home/communities', label: 'Browse communities' }}
            />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {communities.map((c) => (
                <Link
                  key={c.id}
                  to={`/home/communities/${c.id}`}
                  className="glass-card rounded-[20px] p-4 shadow-soft dark:bg-slate-900/50"
                >
                  <p className="font-semibold text-slate-900 dark:text-white">{c.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{c.description}</p>
                  <p className="mt-2 text-[11px] text-slate-400">{c.memberCount} members</p>
                </Link>
              ))}
            </div>
          )
        ) : null}
      </div>

      {/* Edit modal */}
      <AnimatePresence>
        {editOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={() => setEditOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md space-y-4 rounded-t-[28px] bg-white p-6 shadow-2xl dark:bg-slate-900 sm:rounded-[28px]"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold dark:text-white">Edit profile</h2>
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X size={18} />
                </button>
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Bio</span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  maxLength={300}
                  placeholder="Tell campus about you…"
                  className="w-full rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <span className="text-[11px] text-slate-400">{bio.length}/300</span>
              </label>
              <div className="flex gap-2">
                <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-slate-100 py-3 text-xs font-semibold dark:bg-slate-800">
                  <Camera size={14} /> Photo
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => void handlePhotoChange(e.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-slate-100 py-3 text-xs font-semibold dark:bg-slate-800">
                  <ImageIcon size={14} /> Cover
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => void handleCoverChange(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSaveBio()}
                className="w-full rounded-full bg-gradient-to-r from-primary to-indigo-600 py-3 text-sm font-semibold text-white shadow-float disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setLightbox(null)}
          >
            <button
              type="button"
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white"
              onClick={() => setLightbox(null)}
            >
              <X size={20} />
            </button>
            <motion.img
              initial={{ scale: 0.92 }}
              animate={{ scale: 1 }}
              src={lightbox.src}
              alt={lightbox.label}
              className="max-h-[85dvh] max-w-full rounded-2xl object-contain shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-800 dark:text-slate-200">{value}</p>
    </div>
  );
}

function ReelThumb({ reel: r }: { reel: ReelItem }) {
  return (
    <Link
      to={`/home/reels?id=${r.id}`}
      className="group relative aspect-[9/16] overflow-hidden rounded-xl bg-slate-900 shadow-soft"
    >
      {r.coverUrl || r.thumbnailUrl ? (
        <img
          src={(() => {
            const raw = r.coverUrl || r.thumbnailUrl;
            if (!raw) return '';
            return resolveMediaUrl(raw) ?? raw;
          })()}
          alt=""
          className="h-full w-full object-cover transition group-hover:scale-105"
        />
      ) : (
        <video
          src={resolveMediaUrl(r.mediaUrl) ?? r.mediaUrl}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
        />
      )}
      <span className="absolute bottom-1 left-1 text-[10px] font-semibold text-white drop-shadow">
        ♥ {r.likeCount}
      </span>
    </Link>
  );
}

function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: { to: string; label: string };
}) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/50 px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <p className="font-semibold text-slate-800 dark:text-white">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
      {action ? (
        <Link
          to={action.to}
          className="mt-4 inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-float"
        >
          <Plus size={14} /> {action.label}
        </Link>
      ) : null}
    </div>
  );
}
