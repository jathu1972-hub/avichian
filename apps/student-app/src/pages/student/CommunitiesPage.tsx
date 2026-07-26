import { UsersRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface Community {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  type: string;
}

export function CommunitiesPage() {
  const [items, setItems] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<Community[]>('/student/communities')
      .then((res) => setItems(res.data ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Communities</h1>
        <p className="text-sm text-slate-500">Your department and campus groups</p>
      </div>

      {loading ? (
        <div className="h-28 animate-pulse rounded-[24px] bg-slate-100" />
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <div key={c.id} className="glass-card rounded-[24px] p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <UsersRound size={22} />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">{c.name}</p>
                  <p className="mt-1 text-sm text-slate-500">{c.description}</p>
                  <p className="mt-2 text-xs text-slate-400">{c.memberCount} members · {c.type}</p>
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 ? (
            <p className="text-center text-sm text-slate-400">No communities yet</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
