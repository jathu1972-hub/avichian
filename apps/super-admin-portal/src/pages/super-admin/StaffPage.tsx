import { UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState } from '../../components/admin/EmptyState';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { api } from '../../lib/api';

interface StaffMember {
  id: string;
  staffId: string;
  name: string;
  email: string;
  department: string;
  departmentId: string;
  title: string | null;
  status: string;
  online: boolean;
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    staffId: '',
    name: '',
    email: '',
    password: '',
    departmentId: '',
    title: '',
  });

  async function load() {
    const [staffRes, deptRes] = await Promise.all([
      api<StaffMember[]>('/super-admin/staff'),
      api<Department[]>('/super-admin/departments'),
    ]);
    setStaff(staffRes.data ?? []);
    setDepartments(deptRes.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api('/super-admin/staff', { method: 'POST', body: JSON.stringify(form) });
      setShowForm(false);
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
        <h1 className="text-2xl font-bold">Staff Management</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          <UserPlus size={16} className="mr-2 inline" />
          Create Staff
        </Button>
      </div>

      {showForm ? (
        <form onSubmit={handleCreate} className="glass-card space-y-4 rounded-[28px] p-5">
          <Input label="Staff ID" value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value.toUpperCase() })} required />
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">Department</span>
            <select
              className="w-full rounded-[20px] border border-slate-200 px-4 py-3"
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
              required
            >
              <option value="">Select department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <div className="flex gap-3">
            <Button type="submit" loading={saving}>Save Staff</Button>
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="h-48 animate-pulse rounded-[28px] bg-slate-100" />
      ) : staff.length === 0 ? (
        <EmptyState icon={Users} title="No staff accounts" description="Create verified staff here. They use the same AVICHIAN app as students." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {staff.map((s) => (
            <div key={s.id} className="glass-card rounded-[28px] p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-sm text-slate-500">{s.staffId}</p>
                </div>
                <UserPlus className="text-primary" size={20} />
              </div>
              <p className="mt-3 text-sm">{s.email}</p>
              <p className="text-sm text-slate-500">{s.department} · {s.title ?? 'Staff'}</p>
              <p className="mt-2 text-xs">{s.status}{s.online ? ' · Online' : ''}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {s.status === 'ACTIVE' ? (
                  <button
                    type="button"
                    className="rounded-full bg-warning/15 px-3 py-1 text-xs font-medium text-warning"
                    onClick={async () => {
                      await api(`/super-admin/staff/${s.id}/suspend`, {
                        method: 'POST',
                        body: JSON.stringify({ reason: 'Admin action' }),
                      });
                      load();
                    }}
                  >
                    Suspend
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success"
                    onClick={async () => {
                      await api(`/super-admin/staff/${s.id}/activate`, { method: 'POST' });
                      load();
                    }}
                  >
                    Reactivate
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                  onClick={async () => {
                    const password = window.prompt('Temporary password (min 8)', `Staff@${Date.now().toString().slice(-6)}`);
                    if (!password) return;
                    const res = await api<{ temporaryPassword: string }>(
                      `/super-admin/staff/${s.id}/reset-password`,
                      { method: 'POST', body: JSON.stringify({ password }) },
                    );
                    window.alert(`Temp password: ${res.data?.temporaryPassword ?? password}`);
                  }}
                >
                  Reset Password
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}