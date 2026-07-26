import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface Report {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  status: string;
  createdAt: string;
  reporter: { name: string; regNo: string };
  targetUser: { name: string; regNo: string } | null;
}

export function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [filter, setFilter] = useState('OPEN');
  const [message, setMessage] = useState('');

  async function load() {
    const q = filter ? `?status=${filter}` : '';
    const res = await api<Report[]>(`/super-admin/reports${q}`);
    setReports(res.data ?? []);
  }

  useEffect(() => {
    load();
  }, [filter]);

  async function resolve(id: string, action: 'delete_post' | 'suspend_user' | 'warn' | 'none') {
    await api(`/super-admin/reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({
        status: action === 'none' ? 'CLOSED' : 'ACTIONED',
        action,
        adminNotes: `Action: ${action}`,
      }),
    });
    setMessage('Report updated — action audited');
    load();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Report Center</h1>
        <p className="text-sm opacity-60">Spam, harassment, fake accounts, inappropriate content</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {['OPEN', 'REVIEWING', 'ACTIONED', 'CLOSED', ''].map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${filter === s ? 'bg-primary text-white' : 'bg-slate-100'}`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {message ? <p className="text-sm text-success">{message}</p> : null}

      <div className="space-y-3">
        {reports.length === 0 ? (
          <p className="text-slate-500">No reports in this view.</p>
        ) : (
          reports.map((r) => (
            <div key={r.id} className="glass-card rounded-[24px] p-5">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {r.reason} · {r.targetType}
                  </p>
                  <p className="text-sm text-slate-500">
                    Reporter: {r.reporter.name} ({r.reporter.regNo})
                  </p>
                  {r.targetUser ? (
                    <p className="text-sm text-slate-500">
                      Target user: {r.targetUser.name} ({r.targetUser.regNo})
                    </p>
                  ) : null}
                  <p className="text-xs text-slate-400">Target ID: {r.targetId}</p>
                  {r.details ? <p className="mt-2 text-sm">{r.details}</p> : null}
                  <p className="mt-1 text-[11px] text-slate-400">
                    {r.status} · {new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>
                {r.status === 'OPEN' || r.status === 'REVIEWING' ? (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => resolve(r.id, 'delete_post')} className="rounded-full bg-error/10 px-3 py-1.5 text-xs font-medium text-error">
                      Delete Content
                    </button>
                    <button type="button" onClick={() => resolve(r.id, 'warn')} className="rounded-full bg-warning/15 px-3 py-1.5 text-xs font-medium text-warning">
                      Warn User
                    </button>
                    <button type="button" onClick={() => resolve(r.id, 'suspend_user')} className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">
                      Suspend User
                    </button>
                    <button type="button" onClick={() => resolve(r.id, 'none')} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium">
                      Close Report
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
