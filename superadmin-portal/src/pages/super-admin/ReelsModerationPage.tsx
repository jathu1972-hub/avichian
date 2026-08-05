import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { resolveMediaUrl } from '../../lib/config';

interface AdminReel {
  id: string;
  caption: string | null;
  mediaUrl: string;
  coverUrl: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  isDeleted: boolean;
  createdAt: string;
  author: {
    id: string;
    regNo: string;
    name: string;
    department: string;
  };
}

export function ReelsModerationPage() {
  const [items, setItems] = useState<AdminReel[]>([]);
  const [search, setSearch] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<AdminReel[]>(
        `/super-admin/reels?search=${encodeURIComponent(search)}&includeDeleted=${includeDeleted}`,
      );
      setItems(res.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [search, includeDeleted]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function remove(id: string) {
    if (!window.confirm('Soft-delete this reel?')) return;
    await api(`/super-admin/reels/${id}`, { method: 'DELETE' });
    setMessage('Reel deleted');
    await load();
  }

  async function restore(id: string) {
    await api(`/super-admin/reels/${id}/restore`, { method: 'POST' });
    setMessage('Reel restored');
    await load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reels moderation</h1>
        <p className="text-sm opacity-60">
          View &amp; remove inappropriate reels. Super Admin cannot edit student content.
        </p>
      </div>

      {message ? (
        <div className="rounded-[20px] bg-success/10 px-4 py-3 text-sm text-success">{message}</div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search caption, name, reg no…"
          className="min-h-11 min-w-[220px] flex-1 rounded-full border border-slate-200 px-4 text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => setIncludeDeleted(e.target.checked)}
          />
          Include deleted
        </label>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-[24px] bg-slate-100" />
      ) : items.length === 0 ? (
        <p className="text-sm text-slate-400">No reels found.</p>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <div key={r.id} className="glass-card flex flex-wrap gap-4 rounded-[24px] p-4">
              <div className="h-28 w-20 overflow-hidden rounded-xl bg-black">
                {r.coverUrl ? (
                  <img
                    src={resolveMediaUrl(r.coverUrl) ?? r.coverUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <video
                    src={resolveMediaUrl(r.mediaUrl) ?? r.mediaUrl}
                    className="h-full w-full object-cover"
                    muted
                    preload="metadata"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">
                  {r.author.name}{' '}
                  <span className="text-xs font-normal text-slate-400">
                    {r.author.regNo} · {r.author.department}
                  </span>
                </p>
                <p className="mt-1 text-sm text-slate-600">{r.caption || '—'}</p>
                <p className="mt-1 text-xs text-slate-400">
                  ♥ {r.likeCount} · 💬 {r.commentCount} · 👁 {r.viewCount} ·{' '}
                  {new Date(r.createdAt).toLocaleString()}
                  {r.isDeleted ? ' · DELETED' : ''}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {r.isDeleted ? (
                  <button
                    type="button"
                    onClick={() => void restore(r.id)}
                    className="rounded-full bg-success/15 px-3 py-1.5 text-xs font-medium text-success"
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void remove(r.id)}
                    className="rounded-full bg-error/10 px-3 py-1.5 text-xs font-medium text-error"
                  >
                    Delete
                  </button>
                )}
                <a
                  href={`/students/${r.author.id}`}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-center text-xs font-medium"
                >
                  View student
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
