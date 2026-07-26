import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { PostCard } from '../../components/student/PostCard';
import { StoriesStrip } from '../../components/student/StoriesStrip';
import { StoryViewer } from '../../components/student/StoryViewer';
import { fetchFeed, fetchStories, toggleLike } from '../../lib/social';
import type { FeedPost, StoryGroup } from '../../types/social';

export function FeedPage() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [stories, setStories] = useState<StoryGroup[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [activeStory, setActiveStory] = useState<StoryGroup | null>(null);
  const [error, setError] = useState('');

  const loadFeed = useCallback(async (nextCursor?: string) => {
    const data = await fetchFeed(nextCursor);
    setPosts((prev) => (nextCursor ? [...prev, ...data.posts] : data.posts));
    setCursor(data.nextCursor);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [feed, storyGroups] = await Promise.all([fetchFeed(), fetchStories()]);
        if (!cancelled) {
          setPosts(feed.posts);
          setCursor(feed.nextCursor);
          setStories(storyGroups);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load feed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  return (
    <div className="space-y-4">
      <StoriesStrip groups={stories} onOpenStory={setActiveStory} />
      <StoryViewer group={activeStory} onClose={() => setActiveStory(null)} />

      {error ? (
        <p className="rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
      ) : null}

      {posts.length === 0 ? (
        <div className="glass-card rounded-[28px] p-8 text-center shadow-soft">
          <h2 className="text-lg font-semibold text-slate-900">Your feed is quiet</h2>
          <p className="mt-2 text-sm text-slate-500">
            Create a post or add friends from Search to see more here.
          </p>
        </div>
      ) : (
        posts.map((post) => (
          <PostCard key={post.id} post={post} onLike={handleLike} liking={likingId === post.id} />
        ))
      )}

      {cursor ? (
        <Button variant="secondary" loading={loadingMore} onClick={handleLoadMore}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}