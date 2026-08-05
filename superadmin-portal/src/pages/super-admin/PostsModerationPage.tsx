import { useEffect, useState } from 'react';
import { MediaPreview } from '../../components/MediaPreview';
import { api } from '../../lib/api';

interface PostRow {
  id: string;
  caption: string | null;
  mediaUrl: string | null;
  mediaKind?: string | null;
  visibility: string;
  createdAt: string;
  deletedAt: string | null;
  likeCount: number;
  author: { regNo: string; name: string; department: string };
}

export function PostsModerationPage() {
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await api<PostRow[]>(
        `/super-admin/posts?includeDeleted=${includeDeleted ? 'true' : 'false'}`,
      );
      setPosts(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [includeDeleted]);

  async function del(id: string) {
    await api(`/super-admin/posts/${id}/delete`, { method: 'POST' });
    setMessage('Post soft-deleted');
    void load();
  }

  async function restore(id: string) {
    await api(`/super-admin/posts/${id}/restore`, { method: 'POST' });
    setMessage('Post restored');
    void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Content Moderation</h1>
          <p className="text-sm opacity-60">Preview and remove posts — media opens full-size</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => setIncludeDeleted(e.target.checked)}
          />
          Show deleted
        </label>
      </div>
      {message ? <p className="text-sm text-success">{message}</p> : null}
      {loading ? (
        <div className="h-40 animate-pulse rounded-[24px] bg-slate-100" />
      ) : (
        <div className="space-y-3">
          {posts.length === 0 ? (
            <p className="text-slate-500">No posts to moderate.</p>
          ) : (
            posts.map((p) => (
              <div
                key={p.id}
                className={`glass-card grid gap-4 rounded-[24px] p-5 sm:grid-cols-[140px_1fr] ${
                  p.deletedAt ? 'opacity-60' : ''
                }`}
              >
                {p.mediaUrl ? (
                  <MediaPreview
                    url={p.mediaUrl}
                    mediaKind={p.mediaKind}
                    caption={p.caption}
                    thumb
                  />
                ) : (
                  <div className="flex h-28 items-center justify-center rounded-2xl bg-slate-100 text-xs text-slate-400">
                    No media
                  </div>
                )}
                <div className="flex min-w-0 flex-wrap justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{p.author.name}</p>
                    <p className="text-xs text-slate-500">
                      {p.author.regNo} · {p.author.department} · {p.visibility} · {p.likeCount}{' '}
                      likes
                    </p>
                    <p className="mt-2 text-sm text-slate-700">{p.caption || '(no caption)'}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {new Date(p.createdAt).toLocaleString()}
                      {p.deletedAt ? ' · DELETED' : ''}
                    </p>
                    {p.mediaUrl ? (
                      <div className="mt-3 max-w-md">
                        <MediaPreview
                          url={p.mediaUrl}
                          mediaKind={p.mediaKind}
                          caption={p.caption}
                        />
                      </div>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {p.deletedAt ? (
                      <button
                        type="button"
                        onClick={() => void restore(p.id)}
                        className="rounded-full bg-success/15 px-3 py-1.5 text-xs font-medium text-success"
                      >
                        Restore
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void del(p.id)}
                        className="rounded-full bg-error/10 px-3 py-1.5 text-xs font-medium text-error"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
