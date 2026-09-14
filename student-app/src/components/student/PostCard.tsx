import { motion } from 'framer-motion';
import { Heart, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FeedPost, PostVisibility } from '../../types/social';
import { PostComments } from './PostComments';
import {
  archivePost,
  deletePost,
  hidePost,
  updatePost,
} from '../../lib/social';
import { resolveMediaUrl } from '../../lib/config';
import { isVideoMedia } from '../../lib/media';
import { MediaPlayer } from '../media/MediaPlayer';
import { PostVideoPlayer } from '../media/PostVideoPlayer';
import { StudentAvatar } from './StudentAvatar';
import { ContentMenu } from './ContentMenu';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { ReportDialog } from './ReportDialog';

interface PostCardProps {
  post: FeedPost;
  onLike: (postId: string) => void;
  liking?: boolean;
  onRemoved?: (postId: string) => void;
  onUpdated?: (post: FeedPost) => void;
  toast?: (msg: string) => void;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PostCard({ post, onLike, liking, onRemoved, onUpdated, toast }: PostCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editCaption, setEditCaption] = useState(false);
  const [caption, setCaption] = useState(post.caption ?? '');
  const [editVisibility, setEditVisibility] = useState(false);
  const [visibility, setVisibility] = useState<PostVisibility>(post.visibility);
  const [reportOpen, setReportOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount ?? 0);

  async function handleDelete() {
    setBusy(true);
    try {
      await deletePost(post.id);
      onRemoved?.(post.id);
      toast?.('Post deleted successfully.');
    } catch (err) {
      toast?.(err instanceof Error ? err.message : 'Could not delete post');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  async function handleArchive() {
    try {
      await archivePost(post.id);
      onRemoved?.(post.id);
      toast?.('Post archived.');
    } catch (err) {
      toast?.(err instanceof Error ? err.message : 'Could not archive');
    }
  }

  async function saveCaption() {
    try {
      const updated = await updatePost(post.id, { caption });
      onUpdated?.(updated);
      setEditCaption(false);
      toast?.('Caption updated.');
    } catch (err) {
      toast?.(err instanceof Error ? err.message : 'Could not update caption');
    }
  }

  async function saveVisibility() {
    try {
      const updated = await updatePost(post.id, { visibility });
      onUpdated?.(updated);
      setEditVisibility(false);
      toast?.('Visibility updated.');
    } catch (err) {
      toast?.(err instanceof Error ? err.message : 'Could not update visibility');
    }
  }

  function copyLink() {
    const url = `${window.location.origin}/home?post=${post.id}`;
    void navigator.clipboard.writeText(url).then(() => toast?.('Link copied.'));
  }

  async function share() {
    const url = `${window.location.origin}/home?post=${post.id}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'AVICHIAN post', url });
      } catch {
        /* cancelled */
      }
    } else {
      copyLink();
    }
  }

  const ownerActions = [
    { id: 'edit-caption', label: 'Edit Caption', onClick: () => setEditCaption(true) },
    { id: 'edit-vis', label: 'Edit Visibility', onClick: () => setEditVisibility(true) },
    { id: 'delete', label: 'Delete Post', danger: true, onClick: () => setConfirmDelete(true) },
    { id: 'archive', label: 'Archive Post', onClick: () => void handleArchive() },
    { id: 'copy', label: 'Copy Link', onClick: copyLink },
    { id: 'share', label: 'Share', onClick: () => void share() },
  ];

  const viewerActions = [
    {
      id: 'more',
      label: 'Report / Block…',
      danger: true,
      onClick: () => setReportOpen(true),
    },
    {
      id: 'hide',
      label: 'Hide Post',
      onClick: () => {
        void hidePost(post.id)
          .then(() => {
            onRemoved?.(post.id);
            toast?.('Post hidden from your feed.');
          })
          .catch((e) => toast?.(e instanceof Error ? e.message : 'Hide failed'));
      },
    },
    { id: 'copy', label: 'Copy Link', onClick: copyLink },
    { id: 'share', label: 'Share', onClick: () => void share() },
  ];

  return (
    <>
      <motion.article
        layout
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="post-card-premium premium-card min-w-0 overflow-hidden"
      >
        <div className="flex min-w-0 items-center gap-2.5 p-4 sm:gap-3 sm:p-4.5">
          <Link to={`/home/user/${post.author.id}`} className="shrink-0">
            <StudentAvatar name={post.author.name} photoUrl={post.author.profilePhotoUrl} />
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              to={`/home/user/${post.author.id}`}
              className="font-bold tracking-tight text-slate-900 hover:text-primary dark:text-white"
            >
              {post.author.name}
            </Link>
            <p className="text-[11px] font-medium text-slate-500 dark:text-zinc-400">
              {post.author.regNo} · {timeAgo(post.createdAt)} · {post.visibility}
            </p>
          </div>
          <ContentMenu actions={post.isMine ? ownerActions : viewerActions} />
        </div>

        {post.mediaUrl ? (
          (() => {
            const src = resolveMediaUrl(post.mediaUrl) ?? post.mediaUrl;
            return isVideoMedia({
              mediaUrl: src,
              mediaMimeType: post.mediaMimeType,
            }) ? (
              <PostVideoPlayer src={src} mimeType={post.mediaMimeType} />
            ) : (
              <MediaPlayer
                src={src}
                mimeType={post.mediaMimeType}
                variant="feed"
                className="post-card-media max-h-[min(70vh,32rem)] w-full object-cover"
              />
            );
          })()
        ) : null}

        <div className="min-w-0 space-y-3 p-4 sm:p-4.5">
          {editCaption ? (
            <div className="space-y-2">
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                maxLength={2000}
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
              <div className="flex gap-2">
                <button type="button" className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white" onClick={() => void saveCaption()}>
                  Save
                </button>
                <button type="button" className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold dark:bg-zinc-800" onClick={() => setEditCaption(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : post.caption ? (
            <p className="text-sm leading-relaxed text-slate-700 dark:text-zinc-300">{post.caption}</p>
          ) : null}

          {editVisibility ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as PostVisibility)}
                className="rounded-xl border border-slate-200 px-2 py-1 text-sm"
              >
                {(['PUBLIC', 'FRIENDS', 'DEPARTMENT', 'PRIVATE'] as PostVisibility[]).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
              <button type="button" className="rounded-full bg-primary px-3 py-1 text-xs text-white" onClick={() => void saveVisibility()}>
                Save
              </button>
              <button type="button" className="rounded-full bg-slate-100 px-3 py-1 text-xs" onClick={() => setEditVisibility(false)}>
                Cancel
              </button>
            </div>
          ) : null}

          <div className="flex items-center gap-1 border-t border-slate-100/80 pt-2 dark:border-zinc-800">
            <motion.button
              type="button"
              disabled={liking}
              whileTap={{ scale: 0.88 }}
              onClick={() => onLike(post.id)}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold transition ${
                post.likedByMe
                  ? 'bg-error/10 text-error'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-error dark:hover:bg-zinc-800'
              }`}
              aria-label={post.likedByMe ? 'Unlike' : 'Like'}
            >
              <Heart size={18} fill={post.likedByMe ? 'currentColor' : 'none'} strokeWidth={2} />
              {post.likeCount}
            </motion.button>
            <button
              type="button"
              onClick={() => setCommentsOpen(true)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-slate-100 hover:text-primary dark:hover:bg-zinc-800"
              aria-label="Comments"
            >
              <MessageCircle size={18} strokeWidth={2} />
              {commentCount}
            </button>
          </div>
        </div>
      </motion.article>

      <PostComments
        postId={post.id}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCountChange={setCommentCount}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this post?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        loading={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
      />

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="POST"
        targetId={post.id}
        targetUserId={post.author.id}
        allowHide
        onDone={(msg) => {
          toast?.(msg);
          if (msg.toLowerCase().includes('hidden')) onRemoved?.(post.id);
        }}
      />
    </>
  );
}
