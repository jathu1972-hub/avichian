import { Heart, MessageCircle, Send, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { PostComment } from '../../types/social';
import {
  addPostComment,
  deletePostComment,
  editPostComment,
  fetchPostComments,
  togglePostCommentLike,
} from '../../lib/social';
import { connectSocket } from '../../lib/socket';
import { StudentAvatar } from './StudentAvatar';

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function PostComments({
  postId,
  open,
  onClose,
  onCountChange,
}: {
  postId: string;
  open: boolean;
  onClose: () => void;
  onCountChange?: (n: number) => void;
}) {
  const [items, setItems] = useState<PostComment[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const load = useCallback(
    async (next?: string) => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchPostComments(postId, next);
        setItems((prev) => (next ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor);
        onCountChange?.(data.commentCount);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load comments');
      } finally {
        setLoading(false);
      }
    },
    [postId, onCountChange],
  );

  useEffect(() => {
    if (!open) return;
    void load();
    const socket = connectSocket();
    socket.emit('joinPost', postId);
    const onNew = (payload: { targetId?: string; comment?: PostComment }) => {
      if (payload.targetId !== postId || !payload.comment) return;
      setItems((prev) => {
        if (payload.comment!.parentId) {
          return prev.map((c) =>
            c.id === payload.comment!.parentId
              ? {
                  ...c,
                  replies: [...(c.replies ?? []), payload.comment!],
                  replyCount: (c.replyCount ?? 0) + 1,
                }
              : c,
          );
        }
        if (prev.some((c) => c.id === payload.comment!.id)) return prev;
        return [payload.comment!, ...prev];
      });
    };
    const onDel = (payload: { targetId?: string; commentId?: string }) => {
      if (payload.targetId !== postId || !payload.commentId) return;
      setItems((prev) =>
        prev
          .filter((c) => c.id !== payload.commentId)
          .map((c) => ({
            ...c,
            replies: (c.replies ?? []).filter((r) => r.id !== payload.commentId),
          })),
      );
    };
    const onCount = (payload: { targetId?: string; count?: number }) => {
      if (payload.targetId === postId && typeof payload.count === 'number') {
        onCountChange?.(payload.count);
      }
    };
    socket.on('comment:new', onNew);
    socket.on('comment:deleted', onDel);
    socket.on('comment:count', onCount);
    return () => {
      socket.emit('leavePost', postId);
      socket.off('comment:new', onNew);
      socket.off('comment:deleted', onDel);
      socket.off('comment:count', onCount);
    };
  }, [open, postId, load, onCountChange]);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    setError('');
    try {
      const c = await addPostComment(postId, text.trim(), replyTo ?? undefined);
      if (c.parentId) {
        setItems((prev) =>
          prev.map((row) =>
            row.id === c.parentId
              ? { ...row, replies: [...(row.replies ?? []), c], replyCount: (row.replyCount ?? 0) + 1 }
              : row,
          ),
        );
      } else {
        setItems((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);
      }
      setText('');
      setReplyTo(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not comment');
    } finally {
      setSending(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[min(92dvh,640px)] w-full max-w-lg flex-col rounded-t-[1.75rem] bg-white shadow-float dark:bg-zinc-950 sm:rounded-[1.75rem]">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
            <MessageCircle size={18} className="text-primary" />
            Comments
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-zinc-800" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {loading && items.length === 0 ? (
            <p className="text-center text-sm text-slate-400">Loading…</p>
          ) : items.length === 0 ? (
            <p className="text-center text-sm text-slate-400">No comments yet. Be the first.</p>
          ) : (
            items.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                editId={editId}
                editText={editText}
                onEditStart={(id, body) => {
                  setEditId(id);
                  setEditText(body);
                }}
                onEditCancel={() => setEditId(null)}
                onEditSave={async () => {
                  if (!editId) return;
                  const updated = await editPostComment(editId, editText);
                  setItems((prev) =>
                    prev.map((row) => {
                      if (row.id === updated.id) return { ...row, ...updated, replies: row.replies };
                      return {
                        ...row,
                        replies: (row.replies ?? []).map((r) =>
                          r.id === updated.id ? { ...r, ...updated } : r,
                        ),
                      };
                    }),
                  );
                  setEditId(null);
                }}
                onReply={() => setReplyTo(c.id)}
                onLike={async (id) => {
                  const r = await togglePostCommentLike(id);
                  setItems((prev) =>
                    prev.map((row) => {
                      if (row.id === id) return { ...row, likedByMe: r.liked, likeCount: r.likeCount };
                      return {
                        ...row,
                        replies: (row.replies ?? []).map((rep) =>
                          rep.id === id
                            ? { ...rep, likedByMe: r.liked, likeCount: r.likeCount }
                            : rep,
                        ),
                      };
                    }),
                  );
                }}
                onDelete={async (id) => {
                  await deletePostComment(id);
                  setItems((prev) =>
                    prev
                      .filter((row) => row.id !== id)
                      .map((row) => ({
                        ...row,
                        replies: (row.replies ?? []).filter((r) => r.id !== id),
                      })),
                  );
                }}
                onEditText={setEditText}
              />
            ))
          )}
          {cursor ? (
            <button
              type="button"
              disabled={loading}
              className="w-full text-center text-xs font-semibold text-primary"
              onClick={() => void load(cursor)}
            >
              Load more
            </button>
          ) : null}
        </div>

        {error ? <p className="px-4 text-xs text-error">{error}</p> : null}
        {replyTo ? (
          <div className="flex items-center justify-between bg-primary/5 px-4 py-1.5 text-xs text-primary">
            <span>Replying…</span>
            <button type="button" onClick={() => setReplyTo(null)}>
              Cancel
            </button>
          </div>
        ) : null}
        <div className="flex items-center gap-2 border-t border-slate-100 p-3 dark:border-zinc-800">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add a comment… use @regNo to mention"
            maxLength={500}
            className="min-h-11 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 text-sm outline-none focus:border-primary dark:border-zinc-700 dark:bg-zinc-900"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            disabled={sending || !text.trim()}
            onClick={() => void send()}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-white disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentRow({
  comment,
  editId,
  editText,
  onEditStart,
  onEditCancel,
  onEditSave,
  onEditText,
  onReply,
  onLike,
  onDelete,
}: {
  comment: PostComment;
  editId: string | null;
  editText: string;
  onEditStart: (id: string, body: string) => void;
  onEditCancel: () => void;
  onEditSave: () => Promise<void>;
  onEditText: (t: string) => void;
  onReply: () => void;
  onLike: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
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
          <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-zinc-900">
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              {comment.author.name}{' '}
              <span className="font-medium text-slate-400">{timeAgo(comment.createdAt)}</span>
            </p>
            {editId === comment.id ? (
              <div className="mt-1 space-y-1">
                <input
                  value={editText}
                  onChange={(e) => onEditText(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                />
                <div className="flex gap-2 text-xs">
                  <button type="button" className="font-semibold text-primary" onClick={() => void onEditSave()}>
                    Save
                  </button>
                  <button type="button" onClick={onEditCancel}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-700 dark:text-zinc-300">{comment.body}</p>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-3 px-1 text-[11px] font-semibold text-slate-500">
            <button
              type="button"
              className={comment.likedByMe ? 'text-rose-500' : ''}
              onClick={() => void onLike(comment.id)}
            >
              <Heart
                size={11}
                className="mr-0.5 inline"
                fill={comment.likedByMe ? 'currentColor' : 'none'}
              />
              {comment.likeCount}
            </button>
            {!comment.parentId ? (
              <button type="button" onClick={onReply}>
                Reply
              </button>
            ) : null}
            {comment.isMine ? (
              <>
                <button type="button" onClick={() => onEditStart(comment.id, comment.body)}>
                  Edit
                </button>
                <button type="button" className="text-error" onClick={() => void onDelete(comment.id)}>
                  Delete
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
      {(comment.replies ?? []).map((r) => (
        <div key={r.id} className="ml-8">
          <CommentRow
            comment={r}
            editId={editId}
            editText={editText}
            onEditStart={onEditStart}
            onEditCancel={onEditCancel}
            onEditSave={onEditSave}
            onEditText={onEditText}
            onReply={() => undefined}
            onLike={onLike}
            onDelete={onDelete}
          />
        </div>
      ))}
    </div>
  );
}
