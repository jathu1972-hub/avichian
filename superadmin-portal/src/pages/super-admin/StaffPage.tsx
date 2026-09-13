import { Upload, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState } from '../../components/admin/EmptyState';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { api } from '../../lib/api';
import { BulkImportStaff } from './BulkImportStaff';

interface StaffMember {
  id: string;
  userId: string;
  staffId: string;
  name: string;
  email: string;
  department: string;
  departmentId: string;
  title: string | null;
  designation?: string | null;
  status: string;
  online: boolean;
  lastLoginAt: string | null;
  createdAt?: string;
  forcePasswordChange?: boolean;
}

interface Department {
  id: string;
  name: string;
}

export function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    staffId: '',
    name: '',
    email: '',
    password: '',
    departmentId: '',
    title: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
      const [staffRes, deptRes] = await Promise.all([
        api<StaffMember[]>(`/super-admin/staff${q}`),
        api<Department[]>('/super-admin/departments'),
      ]);
      setStaff(staffRes.data ?? []);
      setDepartments(deptRes.data ?? []);
      if (!form.departmentId && deptRes.data?.[0]) {
        setForm((f) => ({ ...f, departmentId: deptRes.data![0].id }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  }, [search, form.departmentId]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(t);
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api('/super-admin/staff', { method: 'POST', body: JSON.stringify(form) });
      setShowForm(false);
      setMessage('Staff created. They must change password on first login.');
      setForm((f) => ({
        staffId: '',
        name: '',
        email: '',
        password: '',
        departmentId: f.departmentId,
        title: '',
      }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create staff');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-50">Staff Management</h1>
          <p className="text-sm text-zinc-400">
            Real STAFF accounts · same AVICHIAN app &amp; login as students
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="w-auto"
            variant="secondary"
            onClick={() => {
              setShowImport(true);
              setShowForm(false);
              setError('');
            }}
          >
            <Upload size={16} className="mr-2 inline" />
            Bulk Import Staff
          </Button>
          <Button
            className="w-auto"
            onClick={() => {
              setShowForm((v) => !v);
              setShowImport(false);
            }}
          >
            <UserPlus size={16} className="mr-2 inline" />
            Create Staff
          </Button>
        </div>
      </div>

      {message ? (
        <p className="rounded-2xl border border-emerald-800 bg-emerald-950/40 px-4 py-2 text-sm text-emerald-200">
          {message}
        </p>
      ) : null}
      {error ? <p className="text-sm text-error">{error}</p> : null}

      <Input
        label="Search staff"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Name, Staff ID, email…"
      />

      {showForm ? (
        <form onSubmit={handleCreate} className="glass-card space-y-4 rounded-[28px] p-5">
          <Input
            label="Staff ID"
            value={form.staffId}
            onChange={(e) => setForm({ ...form, staffId: e.target.value.toUpperCase() })}
            required
          />
          <Input
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <Input
            label="Temporary password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-300">Department</span>
            <select
              className="w-full rounded-[20px] border border-zinc-700 bg-zinc-900 px-4 py-3 text-zinc-100"
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              required
            >
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Designation / Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <div className="flex gap-3">
            <Button type="submit" loading={saving}>
              Save Staff
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="h-48 animate-pulse rounded-[28px] bg-zinc-800" />
      ) : staff.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff accounts"
          description="Create or bulk-import staff. They use the same AVICHIAN login and app as students."
        />
      ) : (
        <div className="overflow-x-auto rounded-[1.5rem] border border-zinc-800">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Staff ID</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Department</th>
                <th className="px-3 py-3">Designation</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Last login</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {staff.map((s) => (
                <tr key={s.id} className="text-zinc-200">
                  <td className="px-3 py-3 font-medium">
                    {s.name}
                    <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                      Staff
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{s.staffId}</td>
                  <td className="px-3 py-3 text-xs text-zinc-400">{s.email}</td>
                  <td className="px-3 py-3 text-xs">{s.department}</td>
                  <td className="px-3 py-3 text-xs">{s.designation || s.title || '—'}</td>
                  <td className="px-3 py-3 text-xs">
                    {s.status}
                    {s.forcePasswordChange ? (
                      <span className="block text-[10px] text-amber-400">Must change password</span>
                    ) : null}
                    {s.online ? <span className="block text-[10px] text-success">Online</span> : null}
                  </td>
                  <td className="px-3 py-3 text-xs text-zinc-500">
                    {s.lastLoginAt ? new Date(s.lastLoginAt).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-3 py-3 text-xs text-zinc-500">
                    {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          className="rounded-full bg-warning/15 px-2 py-1 text-[10px] font-medium text-warning"
                          onClick={async () => {
                            await api(`/super-admin/staff/${s.id}/suspend`, {
                              method: 'POST',
                              body: JSON.stringify({ reason: 'Admin action' }),
                            });
                            void load();
                          }}
                        >
                          Suspend
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="rounded-full bg-success/15 px-2 py-1 text-[10px] font-medium text-success"
                          onClick={async () => {
                            await api(`/super-admin/staff/${s.id}/activate`, { method: 'POST' });
                            void load();
                          }}
                        >
                          Activate
                        </button>
                      )}
                      <button
                        type="button"
                        className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary"
                        onClick={async () => {
                          const password = window.prompt(
                            'Temporary password (min 8 chars, strong)',
                            `Staff@${Date.now().toString().slice(-6)}!`,
                          );
                          if (!password) return;
                          const res = await api<{ temporaryPassword: string }>(
                            `/super-admin/staff/${s.id}/reset-password`,
                            { method: 'POST', body: JSON.stringify({ password }) },
                          );
                          window.alert(
                            `Temp password for ${s.staffId}: ${res.data?.temporaryPassword ?? password}`,
                          );
                          void load();
                        }}
                      >
                        Reset Password
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showImport ? (
        <BulkImportStaff
          departments={departments}
          onClose={() => setShowImport(false)}
          onDone={(msg) => {
            setMessage(msg);
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
