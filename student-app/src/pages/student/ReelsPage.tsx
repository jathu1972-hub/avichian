import { Clapperboard, Heart, Plus, Send, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  addReelComment,
  archiveReel,
  deleteReel,
  deleteReelComment,
  fetchReel,
  fetchReelComments,
  fetchReels,
  hideReel,
  recordReelView,
  reportReel,
  toggleReelCommentLike,
  toggleReelLike,
  toggleReelSave,
  updateReel,
  type ReelComment,
  type ReelItem,
} from '../../lib/social';
import { ReelCard } from '../../components/student/ReelCard';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { StudentAvatar } from '../../components/student/StudentAvatar';

export function ReelsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [menuReel, setMenuReel] = useState<ReelItem | null>(null);
  const [commentReel, setCommentReel] = useState<ReelItem | null>(null);
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const load = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    try {
      const q = searchParams.get('q') || searchParams.get('hashtag') || undefined;
      const data = await fetchReels({
        cursor,
        limit: 20,
        // search via query if we extend fetchReels - pass in URL for now via custom
      });
      // If search in URL
      let items = data.items;
      if (q) {
        const searched = await fetchReels({ limit: 40 });
        const needle = q.replace(/^#/, '').toLowerCase();
        items = searched.items.filter(
          (r) =>
            r.caption?.toLowerCase().includes(needle) ||
            r.hashtags?.some((h) => h.includes(needle)) ||
            r.author.name.toLowerCase().includes(needle) ||
            r.author.department.toLowerCase().includes(needle),
        );
      }
      setReels((prev) => (cursor ? [...prev, ...items] : items));
      setNextCursor(data.nextCursor);
      if (!cursor && items[0]) setActiveId((id) => id ?? items[0]!.id);
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to load reels');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) return;
    void (async () => {
      try {
        const reel = await fetchReel(id);
        setReels((prev) => (prev.some((r) => r.id === reel.id) ? prev : [reel, ...prev]));
        setActiveId(reel.id);
        requestAnimationFrame(() => {
          scrollerRef.current
            ?.querySelector(`[data-reel-id="${id}"]`)
            ?.scrollIntoView({ block: 'start' });
        });
      } catch {
        setToast('Reel not found');
      } finally {
        const next = new URLSearchParams(searchParams);
        next.delete('id');
        setSearchParams(next, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting && e.intersectionRatio >= 0.55)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const id = (visible.target as HTMLElement).dataset.reelId;
          if (id) setActiveId(id);
        }
      },
      { root, threshold: [0.55, 0.75, 0.9] },
    );
    root.querySelectorAll('[data-reel-id]').forEach((el) => observerRef.current?.observe(el));
    return () => observerRef.current?.disconnect();
  }, [reels]);

  useEffect(() => {
    if (!activeId || !nextCursor || loadingMore) return;
    const idx = reels.findIndex((r) => r.id === activeId);
    if (idx >= reels.length - 3) void load(nextCursor);
  }, [activeId, nextCursor, reels, loadingMore, load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function handleLike(id: string) {
    try {
      const r = await toggleReelLike(id);
      setReels((prev) =>
        prev.map((x) =>
          x.id === id ? { ...x, likedByMe: r.liked, likeCount: r.likeCount } : x,
        ),
      );
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Like failed');
    }
  }

  async function handleSave(id: string) {
    try {
      const r = await toggleReelSave(id);
      setReels((prev) =>
        prev.map((x) => (x.id === id ? { ...x, savedByMe: r.saved } : x)),
      );
      setToast(r.saved ? 'Saved to profile' : 'Removed from saved');
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Save failed');
    }
  }

  function handleShare(reel: ReelItem) {
    const url = `${window.location.origin}/home/reels?id=${reel.id}`;
    if (navigator.share) {
      void navigator.share({ title: 'AVICHIAN Reel', text: reel.caption ?? '', url });
    } else {
      void navigator.clipboard.writeText(url);
      setToast('Link copied');
    }
  }

  async function openComments(reel: ReelItem) {
    setCommentReel(reel);
    setCommentsLoading(true);
    setReplyTo(null);
    setCommentText('');
    try {
      setComments(await fetchReelComments(reel.id));
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Could not load comments');
    } finally {
      setCommentsLoading(false);
    }
  }

  async function submitComment() {
    if (!commentReel || !commentText.trim()) return;
    try {
      const c = await addReelComment(commentReel.id, commentText.trim(), replyTo ?? undefined);
      if (replyTo) {
        setComments((prev) =>
          prev.map((p) =>
            p.id === replyTo
              ? { ...p, replies: [...(p.replies ?? []), c], replyCount: (p.replyCount ?? 0) + 1 }
              : p,
          ),
        );
      } else {
        setComments((prev) => [...prev, c]);
      }
      setReels((prev) =>
        prev.map((r) =>
          r.id === commentReel.id
            ? { ...r, commentCount: (r.commentCount ?? 0) + 1 }
            : r,
        ),
      );
      setCommentText('');
      setReplyTo(null);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Comment failed');
    }
  }

  async function handleDelete() {
    if (!deleteId) return;
    setBusy(true);
    try {
      await deleteReel(deleteId);
      setReels((prev) => prev.filter((r) => r.id !== deleteId));
      setToast('Reel deleted');
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
      setDeleteId(null);
    }
  }

  if (loading && reels.length === 0) {
    return (
      <div className="flex h-[min(80dvh,720px)] items-center justify-center rounded-[28px] bg-black">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="glass-card mx-auto max-w-md rounded-[28px] p-10 text-center shadow-soft">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Clapperboard size={32} />
        </div>
        <p className="font-display text-xl font-bold text-slate-900">No reels yet</p>
        <p className="mt-2 text-sm text-slate-500">
          Upload a short vertical video (MP4 H.264 · max 90s · 100MB). Stored in PostgreSQL + object storage.
        </p>
        <Link
          to="/home/create/reel"
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white shadow-float"
        >
          <Plus size={16} /> Create reel
        </Link>
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="mb-2 flex items-center justify-between px-1">
        <h1 className="font-display text-lg font-bold text-slate-900">Reels</h1>
        <Link
          to="/home/create/reel"
          className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
        >
          <Plus size={14} /> New
        </Link>
      </div>

      {toast ? (
        <div className="absolute left-1/2 top-12 z-40 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white shadow-float">
          {toast}
        </div>
      ) : null}

      <div
        ref={scrollerRef}
        className="scroll-region h-[min(calc(100dvh-9.5rem),780px)] max-h-[calc(100dvh-9.5rem)] snap-y snap-mandatory overflow-y-auto overscroll-y-contain rounded-[24px] bg-black shadow-float"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {reels.map((reel) => (
          <ReelCard
            key={reel.id}
            reel={reel}
            active={activeId === reel.id}
            onLike={handleLike}
            onSave={handleSave}
            onComment={openComments}
            onShare={handleShare}
            onMenu={setMenuReel}
            onViewed={(id) => void recordReelView(id)}
          />
        ))}
        {loadingMore ? (
          <div className="flex h-16 items-center justify-center bg-black text-xs text-white/50">
            Loading more…
          </div>
        ) : null}
      </div>

      {/* Comments sheet */}
      {commentReel ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setCommentReel(null)}
        >
          <div
            className="flex max-h-[70dvh] w-full max-w-lg flex-col rounded-t-[28px] bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="font-semibold text-slate-900">
                Comments · {commentReel.commentCount ?? comments.length}
              </p>
              <button type="button" onClick={() => setCommentReel(null)} className="rounded-full p-2 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {commentsLoading ? (
                <p className="text-center text-sm text-slate-400">Loading…</p>
              ) : comments.length === 0 ? (
                <p className="text-center text-sm text-slate-400">No comments yet. Say something.</p>
              ) : (
                comments.map((c) => (
                  <CommentBlock
                    key={c.id}
                    comment={c}
                    onReply={() => setReplyTo(c.id)}
                    onLike={() =>
                      void toggleReelCommentLike(c.id).then((r) => {
                        setComments((prev) =>
                          prev.map((x) =>
                            x.id === c.id
                              ? { ...x, likedByMe: r.liked, likeCount: r.likeCount }
                              : x,
                          ),
                        );
                      })
                    }
                    onDelete={() =>
                      void deleteReelComment(c.id).then(() => {
                        setComments((prev) => prev.filter((x) => x.id !== c.id));
                        setReels((prev) =>
                          prev.map((r) =>
                            r.id === commentReel.id
                              ? { ...r, commentCount: Math.max(0, (r.commentCount ?? 1) - 1) }
                              : r,
                          ),
                        );
                      })
                    }
                  />
                ))
              )}
            </div>
            <div className="border-t border-slate-100 p-3">
              {replyTo ? (
                <p className="mb-1 text-[11px] text-primary">
                  Replying…{' '}
                  <button type="button" className="underline" onClick={() => setReplyTo(null)}>
                    cancel
                  </button>
                </p>
              ) : null}
              <div className="flex gap-2">
                <input
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Add a comment…"
                  className="min-h-11 flex-1 rounded-full border border-slate-200 px-4 text-sm outline-none focus:border-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitComment();
                  }}
                />
                <button
                  type="button"
                  onClick={() => void submitComment()}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {menuReel ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center"
          onClick={() => setMenuReel(null)}
        >
          <div
            className="w-full max-w-sm rounded-t-[24px] bg-white p-2 shadow-2xl sm:rounded-[24px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between px-3 py-2">
              <p className="text-sm font-semibold">More</p>
              <button type="button" onClick={() => setMenuReel(null)} className="rounded-full p-2">
                <X size={18} />
              </button>
            </div>
            {menuReel.isMine ? (
              <>
                <MenuBtn
                  label="Edit caption"
                  onClick={() => {
                    const caption = window.prompt('Caption', menuReel.caption ?? '') ?? '';
                    void updateReel(menuReel.id, { caption })
                      .then((u) => {
                        setReels((prev) => prev.map((r) => (r.id === u.id ? { ...r, ...u } : r)));
                        setToast('Updated');
                        setMenuReel(null);
                      })
                      .catch((e) => setToast(e instanceof Error ? e.message : 'Failed'));
                  }}
                />
                <MenuBtn
                  label="Archive"
                  onClick={() => {
                    void archiveReel(menuReel.id).then(() => {
                      setReels((prev) => prev.filter((r) => r.id !== menuReel.id));
                      setMenuReel(null);
                      setToast('Archived');
                    });
                  }}
                />
                <MenuBtn label="Delete" danger onClick={() => { setDeleteId(menuReel.id); setMenuReel(null); }} />
              </>
            ) : (
              <>
                <MenuBtn
                  label="Hide"
                  onClick={() => {
                    void hideReel(menuReel.id).then(() => {
                      setReels((prev) => prev.filter((r) => r.id !== menuReel.id));
                      setMenuReel(null);
                    });
                  }}
                />
                <MenuBtn
                  label="Report"
                  danger
                  onClick={() => {
                    const reason = window.prompt('Reason', 'INAPPROPRIATE');
                    if (!reason) return;
                    void reportReel(menuReel.id, reason.toUpperCase()).then(() => {
                      setToast('Reported');
                      setMenuReel(null);
                    });
                  }}
                />
              </>
            )}
            <MenuBtn
              label="Copy link"
              onClick={() => {
                void navigator.clipboard.writeText(
                  `${window.location.origin}/home/reels?id=${menuReel.id}`,
                );
                setToast('Copied');
                setMenuReel(null);
              }}
            />
            <MenuBtn
              label="Share to apps"
              onClick={() => {
                handleShare(menuReel);
                setMenuReel(null);
              }}
            />
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete this reel?"
        message="Soft-deleted from the feed. Super Admin can restore if needed."
        confirmLabel="Delete"
        loading={busy}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}

function CommentBlock({
  comment,
  onReply,
  onLike,
  onDelete,
}: {
  comment: ReelComment;
  onReply: () => void;
  onLike: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <StudentAvatar
          name={comment.author.name}
          photoUrl={comment.author.profilePhotoUrl}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900">{comment.author.name}</p>
          <p className="text-sm text-slate-700">{comment.body}</p>
          <div className="mt-1 flex gap-3 text-[11px] text-slate-400">
            <button type="button" onClick={onLike} className={comment.likedByMe ? 'text-rose-500' : ''}>
              <Heart size={12} className="mr-0.5 inline" fill={comment.likedByMe ? 'currentColor' : 'none'} />
              {comment.likeCount}
            </button>
            <button type="button" onClick={onReply}>
              Reply
            </button>
            {comment.isMine ? (
              <button type="button" onClick={onDelete} className="text-error">
                Delete
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {(comment.replies ?? []).map((r) => (
        <div key={r.id} className="ml-10 flex gap-2">
          <StudentAvatar name={r.author.name} photoUrl={r.author.profilePhotoUrl} size="sm" />
          <div>
            <p className="text-xs font-semibold">{r.author.name}</p>
            <p className="text-sm text-slate-700">{r.body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MenuBtn({
  label,
  onClick,
  danger,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl px-4 py-3.5 text-left text-sm font-medium hover:bg-slate-50 ${
        danger ? 'text-error' : 'text-slate-800'
      }`}
    >
      {label}
    </button>
  );
}
