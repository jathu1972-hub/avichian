import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  MessageCircle,
  Send,
  Trash2,
  Users,
  UsersRound,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import { resolveMediaUrl } from '../../lib/config';
import {
  type Community,
  type CommunityMember,
  type CommunityPost,
  createCommunityPost,
  deleteCommunityPost,
  fetchCommunity,
  fetchCommunityMembers,
  fetchCommunityPosts,
  joinCommunity,
  leaveCommunity,
} from '../../lib/communities';

export function CommunityDetailPage() {
  const { id = '' } = useParams();
  const [community, setCommunity] = useState<Community | null>(null);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'posts' | 'members' | 'about'>('posts');
  const [postText, setPostText] = useState('');
  const [posting, setPosting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const c = await fetchCommunity(id);
      setCommunity(c);
      const [m, p] = await Promise.all([
        fetchCommunityMembers(id).catch(() => []),
        c.joined || c.visibility === 'PUBLIC'
          ? fetchCommunityPosts(id).catch(() => [])
          : Promise.resolve([]),
      ]);
      setMembers(m);
      setPosts(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load community');
      setCommunity(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  async function toggleJoin() {
    if (!community) return;
    setBusy(true);
    try {
      if (community.joined) {
        await leaveCommunity(community.id);
        flash('Left community');
      } else {
        await joinCommunity(community.id);
        flash('Joined community');
      }
      await load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function submitPost(e: React.FormEvent) {
    e.preventDefault();
    if (!community || !postText.trim()) return;
    setPosting(true);
    try {
      const post = await createCommunityPost(community.id, { content: postText.trim() });
      setPosts((prev) => [post, ...prev]);
      setPostText('');
      setCommunity((c) => (c ? { ...c, postCount: c.postCount + 1 } : c));
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Post failed');
    } finally {
      setPosting(false);
    }
  }

  async function removePost(postId: string) {
    if (!window.confirm('Delete this post?')) return;
    try {
      await deleteCommunityPost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setCommunity((c) => (c ? { ...c, postCount: Math.max(0, c.postCount - 1) } : c));
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  if (!community) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-error">{error || 'Community not found'}</p>
        <Link to="/home/communities" className="text-sm font-semibold text-primary">
          ← Back to communities
        </Link>
      </div>
    );
  }

  const banner = resolveMediaUrl(community.bannerUrl);
  const icon = resolveMediaUrl(community.iconUrl);

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-10">
      <Link
        to="/home/communities"
        className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-primary"
      >
        <ArrowLeft size={16} /> Communities
      </Link>

      <div className="glass-card overflow-hidden rounded-[28px] shadow-float dark:bg-slate-900/50">
        <div className="relative h-36 bg-gradient-to-br from-primary/40 via-violet-400/30 to-blue-300/40 sm:h-44">
          {banner ? <img src={banner} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div className="relative px-4 pb-5 pt-0 sm:px-6">
          <div className="-mt-10 mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-[22px] border-4 border-white bg-white shadow-soft dark:border-slate-900 dark:bg-slate-800">
              {icon ? (
                <img src={icon} alt="" className="h-full w-full object-cover" />
              ) : (
                <UsersRound className="text-primary" size={32} />
              )}
            </div>
            <button
              type="button"
              disabled={busy || community.status === 'ARCHIVED' || community.accessType === 'INVITE'}
              onClick={() => void toggleJoin()}
              className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ${
                community.joined
                  ? 'bg-slate-500'
                  : 'bg-gradient-to-r from-primary to-blue-600 shadow-float'
              }`}
            >
              {community.joined ? (
                <>
                  <Check size={16} /> Joined
                </>
              ) : (
                'Join community'
              )}
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold uppercase text-primary">
              {community.category}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800">
              {community.visibility}
            </span>
            {community.featured ? (
              <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                Featured
              </span>
            ) : null}
          </div>

          <h1 className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white">
            {community.name}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {community.description || 'No description.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Users size={12} /> {community.memberCount} members
            </span>
            <span>{community.postCount} posts</span>
            {community.department ? <span>{community.department}</span> : null}
            {community.chatEnabled ? (
              <span className="inline-flex items-center gap-1">
                <MessageCircle size={12} /> Chat enabled
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex gap-1 rounded-full bg-slate-100 p-1 text-xs font-semibold dark:bg-slate-800">
        {(['posts', 'members', 'about'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 rounded-full py-2 capitalize ${
              tab === t ? 'bg-white shadow-soft dark:bg-slate-700 dark:text-white' : 'text-slate-500'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'posts' ? (
        <div className="space-y-3">
          {community.joined ? (
            <form
              onSubmit={submitPost}
              className="glass-card flex gap-2 rounded-[22px] p-3 shadow-soft dark:bg-slate-900/50"
            >
              <input
                value={postText}
                onChange={(e) => setPostText(e.target.value)}
                placeholder="Share with the community…"
                className="min-h-11 flex-1 rounded-[18px] border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <button
                type="submit"
                disabled={posting || !postText.trim()}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </form>
          ) : (
            <p className="rounded-[22px] border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400 dark:border-slate-700">
              Join this community to post
            </p>
          )}

          {posts.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No posts yet</p>
          ) : (
            posts.map((p) => (
              <article
                key={p.id}
                className="glass-card rounded-[22px] p-4 shadow-soft dark:bg-slate-900/50"
              >
                <div className="flex items-start gap-3">
                  <StudentAvatar
                    name={p.author.name}
                    photoUrl={p.author.profilePhotoUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {p.author.name}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {new Date(p.createdAt).toLocaleString()}
                          {p.pinned ? ' · Pinned' : ''}
                        </p>
                      </div>
                      {p.isMine ? (
                        <button
                          type="button"
                          onClick={() => void removePost(p.id)}
                          className="rounded-full p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                      {p.content}
                    </p>
                    {p.mediaUrl ? (
                      <img
                        src={resolveMediaUrl(p.mediaUrl) ?? p.mediaUrl}
                        alt=""
                        className="mt-2 max-h-56 rounded-xl object-cover"
                      />
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </div>
      ) : null}

      {tab === 'members' ? (
        <div className="space-y-2">
          {members.map((m) => (
            <div
              key={m.id}
              className="glass-card flex items-center gap-3 rounded-[20px] p-3 shadow-soft dark:bg-slate-900/50"
            >
              <StudentAvatar name={m.user.name} photoUrl={m.user.profilePhotoUrl} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{m.user.name}</p>
                <p className="text-[11px] text-slate-400">{m.user.regNo}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800">
                {m.role}
              </span>
            </div>
          ))}
          {members.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No members visible</p>
          ) : null}
        </div>
      ) : null}

      {tab === 'about' ? (
        <div className="glass-card space-y-4 rounded-[24px] p-5 shadow-soft dark:bg-slate-900/50">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Rules</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
              {community.rules || 'No rules published yet.'}
            </p>
          </div>
          {community.tags?.length ? (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">Tags</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {community.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {community.moderators && community.moderators.length > 0 ? (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">
                Moderators
              </h2>
              <div className="mt-2 space-y-2">
                {community.moderators.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-sm">
                    <StudentAvatar
                      name={m.user.name}
                      photoUrl={m.user.profilePhotoUrl}
                      size="sm"
                    />
                    <span className="font-medium">{m.user.name}</span>
                    <span className="text-[10px] uppercase text-slate-400">{m.role}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2 text-sm text-white shadow-float lg:bottom-8"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
