import { UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { api } from '../../lib/api';

interface StaffMember {
  id: string;
  staffId: string;
  name: string;
  email: string;
  title: string | null;
  status: string;
}

export function HodStaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    staffId: '',
    name: '',
    email: '',
    password: '',
    title: '',
  });

  async function load() {
    setLoading(true);
    const res = await api<StaffMember[]>('/hod/staff');
    setStaff(res.data ?? []);
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
      await api('/hod/staff', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setShowForm(false);
      setForm({ staffId: '', name: '', email: '', password: '', title: '' });
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
        <h1 className="text-2xl font-bold">Department Staff</h1>
        <Button onClick={() => setShowForm((v) => !v)}>
          <UserPlus size={16} className="mr-2 inline" />
          Add Staff
        </Button>
      </div>

      {showForm ? (
        <form onSubmit={handleCreate} className="glass-card space-y-4 rounded-[28px] p-5">
          <Input label="Staff ID" value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value.toUpperCase() })} required />
          <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <div className="flex gap-3">
            <Button type="submit" loading={saving}>Save Staff</Button>
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="h-32 animate-pulse rounded-[28px] bg-slate-100" />
      ) : (
        <div className="space-y-3">
          {staff.map((s) => (
            <div key={s.id} className="glass-card rounded-[28px] p-5">
              <p className="font-semibold">{s.name}</p>
              <p className="text-sm text-slate-500">{s.staffId} · {s.email}</p>
              <p className="mt-1 text-xs text-slate-500">{s.title ?? 'Staff'} · {s.status}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}