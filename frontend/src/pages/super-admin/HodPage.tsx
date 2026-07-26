import { Shield, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EmptyState } from '../../components/admin/EmptyState';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { api } from '../../lib/api';

interface HodRecord {
  id: string;
  regNo: string;
  name: string;
  email: string;
  department: string;
  departmentId: string;
  studentCount: number;
  status: string;
  mfaEnabled: boolean;
}

interface Department {
  id: string;
  name: string;
}

export function HodPage() {
  const [hods, setHods] = useState<HodRecord[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    regNo: 'HOD001',
    name: '',
    email: '',
    password: '',
    departmentId: '',
  });

  async function load() {
    const [hodRes, deptRes] = await Promise.all([
      api<HodRecord[]>('/super-admin/hod'),
      api<Department[]>('/super-admin/departments'),
    ]);
    setHods(hodRes.data ?? []);
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
      await api('/super-admin/hod', { method: 'POST', body: JSON.stringify(form) });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create HOD');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">HOD Management</h1>
          <p className="text-sm opacity-60">Only Super Admin can create or remove HOD accounts.</p>
        </div>
        <Button onClick={() => setShowForm((v) => !v)}>
          <UserPlus size={16} className="mr-2 inline" />
          Create HOD
        </Button>
      </div>

      {showForm ? (
        <form onSubmit={handleCreate} className="glass-card space-y-4 rounded-[28px] p-5">
          <Input label="HOD ID / Reg No" value={form.regNo} onChange={(e) => setForm({ ...form, regNo: e.target.value.toUpperCase() })} required />
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
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <div className="flex gap-3">
            <Button type="submit" loading={saving}>Save HOD</Button>
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="h-32 animate-pulse rounded-[28px] bg-slate-100" />
      ) : hods.length === 0 ? (
        <EmptyState icon={Shield} title="No HOD accounts" description="Create a department first, then add a HOD for Visual Communication." />
      ) : (
        <div className="space-y-3">
          {hods.map((h) => (
            <div key={h.id} className="glass-card flex flex-wrap items-center justify-between gap-4 rounded-[28px] p-5">
              <div>
                <p className="font-semibold">{h.name}</p>
                <p className="text-sm text-slate-500">{h.regNo} · {h.email}</p>
              </div>
              <div className="text-right text-sm">
                <p className="font-medium">{h.department}</p>
                <p className="text-slate-500">{h.studentCount} students · MFA {h.mfaEnabled ? 'on' : 'off'}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}