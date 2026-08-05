import { Calendar, ChevronRight, Sparkles, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { PostCard } from '../../components/student/PostCard';
import { StoriesStrip } from '../../components/student/StoriesStrip';
import { StoryViewer } from '../../components/student/StoryViewer';
import { api } from '../../lib/api';
import { fetchFeed, fetchStories, toggleLike } from '../../lib/social';
import type { FeedPost, StoryGroup } from '../../types/social';

interface CampusHome {
  upcomingEvents: { id: string; name: string; startsAt: string; venue: string | null }[];
  pendingFriendRequests: number;
  announcements: { id: string; title: string }[];
}

export function FeedPage() {
  const location = useLocation();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [campus, setCampus] = useState<CampusHome | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [storiesLoading, setStoriesLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [activeStory, setActiveStory] = useState<StoryGroup | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const loadStories = useCallback(async () => {
    setStoriesLoading(true);
    try {
      const storyGroups = await fetchStories();
      setStories(storyGroups ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stories');
    } finally {
      setStoriesLoading(false);
    }
  }, []);

  const loadFeed = useCallback(async (nextCursor?: string) => {
    const data = await fetchFeed(nextCursor);
    setPosts((prev) => (nextCursor ? [...prev, ...data.posts] : data.posts));
    setCursor(data.nextCursor);
  }, []);

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [feed, storyGroups, home] = await Promise.all([
        fetchFeed(),
        fetchStories(),
        api<CampusHome>('/student/home').catch(() => ({ data: null })),
      ]);
      setPosts(feed.posts);
      setCursor(feed.nextCursor);
      setStories(storyGroups ?? []);
      setCampus(home.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feed');
    } finally {
      setLoading(false);
      setStoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // After creating a story/post, refresh when landing back on home
  useEffect(() => {
    const state = location.state as {
      refreshStories?: boolean;
      newStoryId?: string;
      ts?: number;
    } | null;
    if (state?.refreshStories || state?.newStoryId) {
      void (async () => {
        // Brief delay so PostgreSQL commit is visible to the next query
        await new Promise((r) => setTimeout(r, 150));
        await loadStories();
        await loadFeed();
      })();
      window.history.replaceState({}, document.title);
    }
  }, [location.state, loadStories, loadFeed]);

  // Also refetch stories every time this page becomes the active route
  useEffect(() => {
    if (location.pathname === '/home' || location.pathname === '/home/') {
      void loadStories();
    }
  }, [location.pathname, location.key, loadStories]);

  // Refresh stories when tab regains focus
  useEffect(() => {
    function onFocus() {
      void loadStories();
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadStories]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to like post');
    } finally {
      setLikingId(null);
    }
  }

  async function handleLoadMore() {
    if (!cursor) return;
    try {
      setLoadingMore(true);
      await loadFeed(cursor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  const feedColumn = (
    <div className="mx-auto w-full max-w-xl min-w-0 space-y-4 sm:space-y-5">
      <StoriesStrip groups={stories} loading={storiesLoading} onOpenStory={setActiveStory} />

      {campus && (campus.pendingFriendRequests > 0 || campus.upcomingEvents.length > 0) ? (
        <div className="space-y-2">
          {campus.pendingFriendRequests > 0 ? (
            <Link
              to="/home/friends"
              className="glass-card flex w-full min-w-0 items-center gap-3 rounded-[22px] px-3 py-3 shadow-soft transition hover:bg-white/90 sm:px-4"
            >
              <div className="shrink-0 rounded-2xl bg-primary/10 p-2 text-primary">
                <Users size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">Friend requests</p>
                <p className="text-xs text-slate-500">{campus.pendingFriendRequests} pending</p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-slate-400" />
            </Link>
          ) : null}
          {campus.upcomingEvents[0] ? (
            <Link
              to="/home/events"
              className="glass-card flex w-full min-w-0 items-center gap-3 rounded-[22px] px-3 py-3 shadow-soft sm:px-4"
            >
              <div className="shrink-0 rounded-2xl bg-accent/15 p-2 text-amber-600">
                <Calendar size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">{campus.upcomingEvents[0].name}</p>
                <p className="truncate text-xs text-slate-500">
                  {new Date(campus.upcomingEvents[0].startsAt).toLocaleString()}
                  {campus.upcomingEvents[0].venue ? ` · ${campus.upcomingEvents[0].venue}` : ''}
                </p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-slate-400" />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="scroll-x flex gap-2 pb-1">
        {[
          { to: '/home/reels', label: 'Reels' },
          { to: '/home/events', label: 'Events' },
          { to: '/home/calendar', label: 'Calendar' },
          { to: '/home/friends', label: 'Friends' },
          { to: '/home/chat', label: 'Chat' },
        ].map((chip) => (
          <Link
            key={chip.to}
            to={chip.to}
            className="shrink-0 rounded-full bg-white/80 px-3 py-2 text-xs font-medium text-slate-600 shadow-soft ring-1 ring-slate-100"
          >
            {chip.label}
          </Link>
        ))}
      </div>

      {error ? (
        <p className="break-anywhere rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
      ) : null}
      {toast ? (
        <p className="rounded-[20px] bg-success/10 px-4 py-3 text-sm text-success">{toast}</p>
      ) : null}

      {posts.length === 0 ? (
        <div className="glass-card rounded-[28px] p-6 text-center shadow-soft sm:p-8">
          <Sparkles className="mx-auto text-primary" size={28} />
          <p className="mt-3 font-semibold text-slate-900">Your feed is quiet</p>
          <p className="mt-1 text-sm text-slate-500">Add friends or create the first post for your campus.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link to="/home/create" className="rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-white">
              Create post
            </Link>
            <Link to="/home/search" className="rounded-full bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700">
              Find friends
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onLike={handleLike}
              liking={likingId === post.id}
              toast={setToast}
              onRemoved={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
              onUpdated={(updated) =>
                setPosts((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
              }
            />
          ))}
          {cursor ? (
            <Button type="button" variant="secondary" loading={loadingMore} onClick={handleLoadMore}>
              Load more
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );

  return (
    <div className="w-full min-w-0">
      <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_minmax(0,18rem)]">
        {/* Left panel — desktop only */}
        <aside className="hidden min-w-0 xl:block">
          <div className="sticky top-24 space-y-3">
            <div className="glass-card rounded-[24px] p-4 shadow-soft">
              <p className="text-sm font-semibold text-slate-900">Campus</p>
              <p className="mt-1 text-xs text-slate-500">Shortcuts stay on the left on large screens.</p>
              <div className="mt-3 flex flex-col gap-1">
                {[
                  { to: '/home/friends', label: 'Friends' },
                  { to: '/home/reels', label: 'Reels' },
                  { to: '/home/events', label: 'Events' },
                  { to: '/home/settings', label: 'Settings' },
                ].map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="rounded-xl px-3 py-2 text-sm font-medium text-slate-600 hover:bg-primary/10 hover:text-primary"
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </aside>

        {feedColumn}

        {/* Right panel — tablet+ */}
        <aside className="hidden min-w-0 lg:block">
          <div className="sticky top-24 space-y-3">
            {campus?.upcomingEvents?.[0] ? (
              <div className="glass-card rounded-[24px] p-4 shadow-soft">
                <p className="text-sm font-semibold text-slate-900">Up next</p>
                <p className="mt-2 text-sm font-medium text-slate-800 break-anywhere">
                  {campus.upcomingEvents[0].name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(campus.upcomingEvents[0].startsAt).toLocaleString()}
                </p>
                <Link to="/home/events" className="mt-3 inline-block text-xs font-medium text-primary">
                  All events
                </Link>
              </div>
            ) : (
              <div className="glass-card rounded-[24px] p-4 shadow-soft">
                <p className="text-sm font-semibold text-slate-900">Tips</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-500">
                  Share a story, post to your department, or message friends — all private to your college.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>

      {activeStory ? (
        <StoryViewer
          group={activeStory}
          onClose={() => setActiveStory(null)}
          toast={setToast}
          onStoryRemoved={(storyId, userId) => {
            setStories((prev) =>
              prev
                .map((g) =>
                  g.user.id !== userId
                    ? g
                    : {
                        ...g,
                        stories: g.stories.filter((s) => s.id !== storyId),
                      },
                )
                .filter((g) => g.stories.length > 0),
            );
            setActiveStory((cur) => {
              if (!cur || cur.user.id !== userId) return cur;
              const nextStories = cur.stories.filter((s) => s.id !== storyId);
              if (nextStories.length === 0) return null;
              return { ...cur, stories: nextStories };
            });
          }}
        />
      ) : null}
    </div>
  );
}
