import { motion } from 'framer-motion';
import { Heart, MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FeedPost } from '../../types/social';
import { StudentAvatar } from './StudentAvatar';

interface PostCardProps {
  post: FeedPost;
  onLike: (postId: string) => void;
  liking?: boolean;
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

export function PostCard({ post, onLike, liking }: PostCardProps) {
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card overflow-hidden rounded-[28px] shadow-soft"
    >
      <div className="flex items-center gap-3 p-4">
        <Link to={`/home/user/${post.author.id}`}>
          <StudentAvatar name={post.author.name} photoUrl={post.author.profilePhotoUrl} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/home/user/${post.author.id}`} className="font-semibold text-slate-900 hover:text-primary">
            {post.author.name}
          </Link>
          <p className="text-xs text-slate-500">
            {post.author.regNo} · {timeAgo(post.createdAt)}
          </p>
        </div>
      </div>

      {post.mediaUrl ? (
        <img src={post.mediaUrl} alt="" className="max-h-[420px] w-full object-cover" />
      ) : null}

      <div className="space-y-2 p-4">
        {post.caption ? <p className="text-sm leading-relaxed text-slate-700">{post.caption}</p> : null}

        <div className="flex items-center gap-4">
          <button
            type="button"
            disabled={liking}
            onClick={() => onLike(post.id)}
            className={`inline-flex items-center gap-1.5 text-sm font-medium transition ${post.likedByMe ? 'text-error' : 'text-slate-500 hover:text-error'}`}
          >
            <Heart size={18} fill={post.likedByMe ? 'currentColor' : 'none'} />
            {post.likeCount}
          </button>
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-400">
            <MessageCircle size={18} />
            Chat in Step 2
          </span>
        </div>
      </div>
    </motion.article>
  );
}