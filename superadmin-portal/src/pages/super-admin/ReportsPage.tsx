import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';

interface Report {
  id: string;
  targetType: string;
  targetId: string;
  reason: string;
  details: string | null;
  evidenceUrl?: string | null;
  status: string;
  adminNotes?: string | null;
  createdAt: string;
  reporter: { id: string; name: string; regNo: string };
  targetUser: { id: string; name: string; regNo: string } | null;
  actions?: Array<{ id: string; action: string; notes: string | null; admin: string; createdAt: string }>;
}

interface Complaint {
  id: string;
  ticketNumber: string;
  category: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  user: { id: string; name: string; regNo: string };
}

const REPORT_FILTERS = ['OPEN', 'REVIEWING', 'ACTIONED', 'CLOSED', 'REJECTED', ''];
const COMPLAINT_FILTERS = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', ''];

export function ReportsPage() {
  const [tab, setTab] = useState<'reports' | 'complaints'>('reports');
  const [reports, setReports] = useState<Report[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [filter, setFilter] = useState('OPEN');
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const loadReports = useCallback(async () => {
    const q = filter ? `?status=${filter}` : '';
    const res = await api<Report[]>(`/super-admin/reports${q}`);
    setReports(res.data ?? []);
  }, [filter]);

  const loadComplaints = useCallback(async () => {
    const q = filter ? `?status=${filter}` : '';
    const res = await api<Complaint[]>(`/super-admin/complaints${q}`);
    setComplaints(res.data ?? []);
  }, [filter]);

  useEffect(() => {
    if (tab === 'reports') void loadReports();
    else void loadComplaints();
  }, [tab, loadReports, loadComplaints]);

  async function resolve(
    id: string,
    action:
      | 'delete_post'
      | 'delete_story'
      | 'delete_reel'
      | 'suspend_user'
      | 'ban_user'
      | 'warn'
      | 'none',
    status: 'ACTIONED' | 'CLOSED' | 'REJECTED' = 'ACTIONED',
  ) {
    await api(`/super-admin/reports/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({
        status: action === 'none' && status === 'ACTIONED' ? 'CLOSED' : status,
        action,
        adminNotes: notes[id] || `Action: ${action}`,
      }),
    });
    setMessage('Report updated — moderation action logged');
    await loadReports();
  }

  async function updateComplaint(id: string, status: string) {
    await api(`/super-admin/complaints/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        adminNotes: notes[id] || undefined,
      }),
    });
    setMessage('Complaint updated');
    await loadComplaints();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Moderation center</h1>
        <p className="text-sm opacity-60">
          Reports, complaints & safety actions — real PostgreSQL data
        </p>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            setTab('reports');
            setFilter('OPEN');
          }}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            tab === 'reports' ? 'bg-primary text-white' : 'bg-slate-100'
          }`}
        >
          Reports
        </button>
        <button
          type="button"
          onClick={() => {
            setTab('complaints');
            setFilter('OPEN');
          }}
          className={`rounded-full px-4 py-2 text-sm font-semibold ${
            tab === 'complaints' ? 'bg-primary text-white' : 'bg-slate-100'
          }`}
        >
          Complaints
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(tab === 'reports' ? REPORT_FILTERS : COMPLAINT_FILTERS).map((s) => (
          <button
            key={s || 'all'}
            type="button"
            onClick={() => setFilter(s)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              filter === s ? 'bg-slate-900 text-white' : 'bg-slate-100'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {message ? <p className="text-sm text-success">{message}</p> : null}

      {tab === 'reports' ? (
        <div className="space-y-3">
          {reports.length === 0 ? (
            <p className="text-slate-500">No reports in this view.</p>
          ) : (
            reports.map((r) => (
              <div key={r.id} className="glass-card rounded-[24px] p-5">
                <div className="flex flex-wrap justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {r.reason} · {r.targetType}
                    </p>
                    <p className="text-sm text-slate-500">
                      Reporter: {r.reporter.name} ({r.reporter.regNo})
                    </p>
                    {r.targetUser ? (
                      <p className="text-sm text-slate-500">
                        Target: {r.targetUser.name} ({r.targetUser.regNo})
                      </p>
                    ) : null}
                    <p className="text-xs text-slate-400">Target ID: {r.targetId}</p>
                    {r.details ? <p className="mt-2 text-sm">{r.details}</p> : null}
                    {r.evidenceUrl ? (
                      <a
                        href={r.evidenceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs font-medium text-primary"
                      >
                        View evidence
                      </a>
                    ) : null}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {r.status} · {new Date(r.createdAt).toLocaleString()}
                    </p>
                    {r.actions && r.actions.length > 0 ? (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Last action: {r.actions[0].action} by {r.actions[0].admin}
                      </p>
                    ) : null}
                    <textarea
                      placeholder="Moderator notes…"
                      value={notes[r.id] ?? ''}
                      onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                      className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                      rows={2}
                    />
                  </div>
                  {r.status === 'OPEN' || r.status === 'REVIEWING' ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void resolve(r.id, 'delete_post')}
                        className="rounded-full bg-error/10 px-3 py-1.5 text-xs font-medium text-error"
                      >
                        Delete content
                      </button>
                      <button
                        type="button"
                        onClick={() => void resolve(r.id, 'delete_reel')}
                        className="rounded-full bg-error/10 px-3 py-1.5 text-xs font-medium text-error"
                      >
                        Delete reel
                      </button>
                      <button
                        type="button"
                        onClick={() => void resolve(r.id, 'warn')}
                        className="rounded-full bg-warning/15 px-3 py-1.5 text-xs font-medium text-warning"
                      >
                        Warn
                      </button>
                      <button
                        type="button"
                        onClick={() => void resolve(r.id, 'suspend_user')}
                        className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Suspend
                      </button>
                      <button
                        type="button"
                        onClick={() => void resolve(r.id, 'ban_user')}
                        className="rounded-full bg-black px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Ban
                      </button>
                      <button
                        type="button"
                        onClick={() => void resolve(r.id, 'none', 'REJECTED')}
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => void resolve(r.id, 'none', 'CLOSED')}
                        className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium"
                      >
                        Close
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {complaints.length === 0 ? (
            <p className="text-slate-500">No complaints in this view.</p>
          ) : (
            complaints.map((c) => (
              <div key={c.id} className="glass-card rounded-[24px] p-5">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {c.ticketNumber}
                  </span>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    {c.priority}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold">
                    {c.status}
                  </span>
                </div>
                <p className="mt-2 font-semibold">{c.subject}</p>
                <p className="text-sm text-slate-500">
                  {c.user.name} ({c.user.regNo}) · {c.category}
                </p>
                <p className="mt-2 text-sm">{c.description}</p>
                <textarea
                  placeholder="Admin notes…"
                  value={notes[c.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  rows={2}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void updateComplaint(c.id, 'IN_PROGRESS')}
                    className="rounded-full bg-sky-100 px-3 py-1.5 text-xs font-medium text-sky-800"
                  >
                    In progress
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateComplaint(c.id, 'RESOLVED')}
                    className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800"
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => void updateComplaint(c.id, 'DISMISSED')}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
