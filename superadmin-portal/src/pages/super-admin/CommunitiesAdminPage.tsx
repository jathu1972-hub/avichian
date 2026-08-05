import { useCallback, useEffect, useState } from 'react';
import { Archive, Plus, Search, Trash2, UsersRound, X } from 'lucide-react';
import { api } from '../../lib/api';

type Community = {
  id: string;
  name: string;
  description: string;
  category: string;
  department: string | null;
  departmentId: string | null;
  bannerUrl: string | null;
  iconUrl: string | null;
  visibility: string;
  accessType: string;
  status: string;
  rules: string | null;
  tags: string[];
  chatEnabled: boolean;
  featured: boolean;
  memberCount: number;
  postCount: number;
};

type Department = { id: string; name: string };

const CATEGORIES = [
  'CLUB',
  'SPORTS',
  'CULTURAL',
  'ACADEMIC',
  'DEPARTMENT',
  'OFFICIAL',
  'HOBBY',
  'TECH',
  'OTHER',
];

const emptyForm = {
  name: '',
  description: '',
  category: 'CLUB',
  departmentId: '',
  bannerUrl: '',
  iconUrl: '',
  visibility: 'PUBLIC',
  accessType: 'OPEN',
  rules: '',
  tags: '',
  chatEnabled: true,
  featured: false,
};

export function CommunitiesAdminPage() {
  const [items, setItems] = useState<Community[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Community | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (statusFilter) q.set('status', statusFilter);
      const res = await api<Community[]>(`/super-admin/communities?${q.toString()}`);
      setItems(res.data ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api<Department[]>('/super-admin/departments')
      .then((res) => setDepartments(res.data ?? []))
      .catch(() => setDepartments([]));
  }, []);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError('');
    setShowForm(true);
  }

  function openEdit(c: Community) {
    setEditing(c);
    setForm({
      name: c.name,
      description: c.description,
      category: c.category,
      departmentId: c.departmentId ?? '',
      bannerUrl: c.bannerUrl ?? '',
      iconUrl: c.iconUrl ?? '',
      visibility: c.visibility,
      accessType: c.accessType,
      rules: c.rules ?? '',
      tags: (c.tags ?? []).join(', '),
      chatEnabled: c.chatEnabled,
      featured: c.featured,
    });
    setError('');
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      category: form.category,
      departmentId: form.departmentId || null,
      bannerUrl: form.bannerUrl.trim() || null,
      iconUrl: form.iconUrl.trim() || null,
      visibility: form.visibility,
      accessType: form.accessType,
      rules: form.rules.trim() || null,
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      chatEnabled: form.chatEnabled,
      featured: form.featured,
    };
    try {
      if (editing) {
        await api(`/super-admin/communities/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
        flash('Community updated');
      } else {
        await api('/super-admin/communities', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        flash('Community created');
      }
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function archive(id: string) {
    if (!window.confirm('Archive this community?')) return;
    try {
      await api(`/super-admin/communities/${id}/archive`, { method: 'POST' });
      flash('Archived');
      await load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete (hide) this community permanently from discovery?')) return;
    try {
      await api(`/super-admin/communities/${id}`, { method: 'DELETE' });
      flash('Deleted');
      await load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Communities</h1>
          <p className="text-sm text-slate-500">
            Create and manage official campus groups — stored in PostgreSQL
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-float"
        >
          <Plus size={16} /> Create community
        </button>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 dark:border-slate-700 dark:bg-slate-900">
          <Search size={16} className="text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search communities…"
            className="min-h-11 w-full bg-transparent text-sm outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="min-h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
          <option value="HIDDEN">Hidden</option>
        </select>
      </div>

      {toast ? (
        <div className="rounded-2xl bg-slate-900 px-4 py-2 text-center text-sm text-white">{toast}</div>
      ) : null}

      {loading ? (
        <div className="h-40 animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
      ) : items.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-200 px-6 py-16 text-center dark:border-slate-700">
          <UsersRound className="mx-auto text-primary" size={32} />
          <p className="mt-3 font-semibold">No communities yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Create Film Club, Coding Club, or any official campus group.
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="mt-4 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white"
          >
            Create first community
          </button>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((c) => (
            <div
              key={c.id}
              className="glass-card flex flex-col rounded-[24px] p-4 shadow-soft dark:bg-slate-900/50"
            >
              <div className="mb-2 flex flex-wrap gap-1">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {c.category}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800">
                  {c.status}
                </span>
                {c.featured ? (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    Featured
                  </span>
                ) : null}
              </div>
              <h2 className="font-semibold text-slate-900 dark:text-white">{c.name}</h2>
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                {c.description || 'No description'}
              </p>
              <p className="mt-2 text-[11px] text-slate-400">
                {c.memberCount} members · {c.postCount} posts
                {c.department ? ` · ${c.department}` : ''}
              </p>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => openEdit(c)}
                  className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold dark:bg-slate-800"
                >
                  Edit
                </button>
                {c.status === 'ACTIVE' ? (
                  <button
                    type="button"
                    onClick={() => void archive(c.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:bg-amber-950"
                  >
                    <Archive size={12} /> Archive
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void remove(c.id)}
                  className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 dark:bg-rose-950"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setShowForm(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={submit}
            className="max-h-[92dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-2xl dark:bg-slate-900 sm:rounded-[28px]"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editing ? 'Edit community' : 'Create community'}
              </h2>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-full p-2">
                <X size={18} />
              </button>
            </div>
            {error ? <p className="text-sm text-error">{error}</p> : null}
            <input
              required
              placeholder="Community name *"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <textarea
              placeholder="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="rounded-2xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                className="rounded-2xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="">No department</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <select
                value={form.visibility}
                onChange={(e) => setForm({ ...form, visibility: e.target.value })}
                className="rounded-2xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="PUBLIC">Public</option>
                <option value="PRIVATE">Private</option>
              </select>
              <select
                value={form.accessType}
                onChange={(e) => setForm({ ...form, accessType: e.target.value })}
                className="rounded-2xl border border-slate-200 px-3 py-3 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                <option value="OPEN">Open join</option>
                <option value="REQUEST">Request</option>
                <option value="INVITE">Invite only</option>
              </select>
            </div>
            <input
              placeholder="Banner image URL (optional)"
              value={form.bannerUrl}
              onChange={(e) => setForm({ ...form, bannerUrl: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <input
              placeholder="Icon image URL (optional)"
              value={form.iconUrl}
              onChange={(e) => setForm({ ...form, iconUrl: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <textarea
              placeholder="Rules"
              value={form.rules}
              onChange={(e) => setForm({ ...form, rules: e.target.value })}
              rows={2}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <input
              placeholder="Tags (comma separated)"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800"
            />
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.chatEnabled}
                  onChange={(e) => setForm({ ...form, chatEnabled: e.target.checked })}
                />
                Chat enabled
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.featured}
                  onChange={(e) => setForm({ ...form, featured: e.target.checked })}
                />
                Featured
              </label>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 rounded-full bg-primary py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full bg-slate-100 px-5 py-3 text-sm font-semibold dark:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
