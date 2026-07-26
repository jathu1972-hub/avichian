import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface PostRow {
  id: string;
  caption: string | null;
  mediaUrl: string | null;
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

  async function load() {
    const res = await api<PostRow[]>(
      `/super-admin/posts?includeDeleted=${includeDeleted ? 'true' : 'false'}`,
    );
    setPosts(res.data ?? []);
  }

  useEffect(() => {
    load();
  }, [includeDeleted]);

  async function del(id: string) {
    await api(`/super-admin/posts/${id}/delete`, { method: 'POST' });
    setMessage('Post soft-deleted');
    load();
  }

  async function restore(id: string) {
    await api(`/super-admin/posts/${id}/restore`, { method: 'POST' });
    setMessage('Post restored');
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Content Moderation</h1>
          <p className="text-sm opacity-60">Review and remove public posts</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} />
          Show deleted
        </label>
      </div>
      {message ? <p className="text-sm text-success">{message}</p> : null}
      <div className="space-y-3">
        {posts.length === 0 ? (
          <p className="text-slate-500">No posts to moderate.</p>
        ) : (
          posts.map((p) => (
            <div key={p.id} className={`glass-card rounded-[24px] p-5 ${p.deletedAt ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-semibold">{p.author.name}</p>
                  <p className="text-xs text-slate-500">
                    {p.author.regNo} · {p.author.department} · {p.visibility} · {p.likeCount} likes
                  </p>
                  <p className="mt-2 text-sm text-slate-700">{p.caption || '(no caption)'}</p>
                  {p.mediaUrl ? <p className="mt-1 text-xs text-primary">Has media attachment</p> : null}
                  <p className="mt-1 text-[11px] text-slate-400">{new Date(p.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex gap-2">
                  {p.deletedAt ? (
                    <button type="button" onClick={() => restore(p.id)} className="rounded-full bg-success/15 px-3 py-1.5 text-xs font-medium text-success">
                      Restore
                    </button>
                  ) : (
                    <button type="button" onClick={() => del(p.id)} className="rounded-full bg-error/10 px-3 py-1.5 text-xs font-medium text-error">
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
