import { Building2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { api } from '../../lib/api';

interface Department {
  id: string;
  name: string;
  code: string | null;
  studentCount: number;
  rosterCount: number;
  staffCount: number;
}

export function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('Visual Communication');
  const [code, setCode] = useState('VC');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    const res = await api<Department[]>('/super-admin/departments');
    setDepartments(res.data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function seedDefaults() {
    await api('/super-admin/departments/seed-defaults', { method: 'POST' });
    load();
  }

  async function createDepartment(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api('/super-admin/departments', {
        method: 'POST',
        body: JSON.stringify({ name, code }),
      });
      setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create department');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Departments</h1>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setShowForm((v) => !v)}>
            <Plus size={16} className="mr-2 inline" />
            Add Department
          </Button>
          <Button variant="secondary" onClick={seedDefaults}>Seed college departments</Button>
        </div>
      </div>
      {showForm ? (
        <form onSubmit={createDepartment} className="glass-card grid gap-4 rounded-[28px] p-5 md:grid-cols-2">
          <Input label="Department name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Code" value={code} onChange={(e) => setCode(e.target.value)} />
          {error ? <p className="text-sm text-error md:col-span-2">{error}</p> : null}
          <div className="flex gap-3 md:col-span-2">
            <Button type="submit" loading={saving}>Save</Button>
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}
      {loading ? (
        <div className="h-48 animate-pulse rounded-[28px] bg-slate-100" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {departments.map((d) => (
            <div key={d.id} className="glass-card rounded-[28px] p-5">
              <div className="flex items-center gap-3">
                <Building2 className="text-primary" size={22} />
                <div>
                  <p className="font-semibold">{d.name}</p>
                  <p className="text-xs text-slate-500">{d.code ?? '—'}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-slate-50 p-2">
                  <p className="font-bold text-lg">{d.studentCount}</p>
                  <p className="text-slate-500">Students</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <p className="font-bold text-lg">{d.rosterCount}</p>
                  <p className="text-slate-500">Roster</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-2">
                  <p className="font-bold text-lg">{d.staffCount}</p>
                  <p className="text-slate-500">Staff</p>
                </div>
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
}