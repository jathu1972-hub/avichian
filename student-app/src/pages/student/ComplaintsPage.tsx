import { AnimatePresence, motion } from 'framer-motion';
import { LifeBuoy, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMyComplaints, submitComplaint } from '../../lib/safety';

const CATEGORIES = [
  { id: 'TECHNICAL', label: 'Technical problem' },
  { id: 'LOGIN', label: 'Login issue' },
  { id: 'BUG', label: 'App bug' },
  { id: 'STAFF', label: 'Staff issue' },
  { id: 'CAMPUS', label: 'Campus issue' },
  { id: 'COMMUNITY', label: 'Community issue' },
  { id: 'EVENT', label: 'Event issue' },
  { id: 'FEATURE', label: 'Feature request' },
  { id: 'SAFETY', label: 'Safety concern' },
  { id: 'OTHER', label: 'Other' },
];

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

type Complaint = {
  id: string;
  ticketNumber: string;
  category: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  createdAt: string;
  adminNotes?: string | null;
};

export function ComplaintsPage() {
  const [items, setItems] = useState<Complaint[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    category: 'TECHNICAL',
    subject: '',
    description: '',
    priority: 'MEDIUM',
  });
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await fetchMyComplaints()) as Complaint[];
      setItems(data);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (form.subject.trim().length < 3) {
      setError('Subject is required');
      return;
    }
    if (form.description.trim().length < 10) {
      setError('Please add more detail (at least 10 characters)');
      return;
    }
    setBusy(true);
    try {
      const res = await submitComplaint({
        category: form.category,
        subject: form.subject.trim(),
        description: form.description.trim(),
        priority: form.priority,
      });
      setToast(`Ticket ${res.ticketNumber} created`);
      setOpen(false);
      setForm({ category: 'TECHNICAL', subject: '', description: '', priority: 'MEDIUM' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
            Support tickets
          </h1>
          <p className="text-sm text-slate-500">Complaints & requests to Super Admin</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-float"
        >
          <Plus size={16} /> New
        </button>
      </div>

      <Link to="/home/settings" className="text-sm font-medium text-primary">
        ← Back to settings
      </Link>

      {loading ? (
        <div className="h-32 animate-pulse rounded-[24px] bg-slate-100 dark:bg-slate-800" />
      ) : items.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-200 px-6 py-14 text-center dark:border-slate-700">
          <LifeBuoy className="mx-auto text-primary" size={32} />
          <p className="mt-3 font-semibold">No tickets yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Submit a complaint about bugs, campus issues, or safety.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => (
            <article
              key={c.id}
              className="glass-card rounded-[22px] p-4 shadow-soft dark:bg-slate-900/50"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold text-primary">
                  {c.ticketNumber}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500 dark:bg-slate-800">
                  {c.status}
                </span>
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                  {c.priority}
                </span>
              </div>
              <h2 className="mt-2 font-semibold text-slate-900 dark:text-white">{c.subject}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {c.category} · {new Date(c.createdAt).toLocaleString()}
              </p>
              <p className="mt-2 line-clamp-3 text-sm text-slate-600 dark:text-slate-300">
                {c.description}
              </p>
              {c.adminNotes ? (
                <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800">
                  Admin: {c.adminNotes}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6"
            onClick={() => setOpen(false)}
          >
            <motion.form
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={submit}
              className="max-h-[90dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-2xl dark:bg-slate-900 sm:rounded-[28px]"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold dark:text-white">New complaint</h2>
                <button type="button" onClick={() => setOpen(false)} className="p-2">
                  <X size={18} />
                </button>
              </div>
              {error ? <p className="text-sm text-error">{error}</p> : null}
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                required
                placeholder="Subject *"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <textarea
                required
                placeholder="Describe the issue *"
                rows={4}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <select
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    Priority: {p}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-primary py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? 'Submitting…' : 'Submit ticket'}
              </button>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2 text-sm text-white">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
