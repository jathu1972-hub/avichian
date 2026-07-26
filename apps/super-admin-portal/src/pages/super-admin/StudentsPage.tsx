import { GraduationCap, KeyRound, Search, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/admin/EmptyState';
import { api } from '../../lib/api';

interface Student {
  id: string;
  regNo: string;
  name: string;
  email: string;
  department: string;
  status: string;
  online: boolean;
  lastLoginAt: string | null;
  year?: number | null;
  isLocked?: boolean;
  lockedUntil?: string | null;
  failedLoginCount?: number;
}

interface Department {
  id: string;
  name: string;
}

function generateTempPassword() {
  // Meets app password rules: 8+ chars, upper, lower, number
  return `Tmp@${Math.random().toString(36).slice(2, 8)}A1`;
}

export function StudentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [tempPw, setTempPw] = useState('');
  const [form, setForm] = useState({
    regNo: '',
    name: '',
    email: '',
    mobile: '',
    departmentId: '',
    year: '1',
    password: generateTempPassword(),
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ items: Student[]; total: number }>(
        `/super-admin/students?search=${encodeURIComponent(search)}&limit=50`,
      );
      setStudents(res.data?.items ?? []);
      setTotal(res.data?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    api<Department[]>('/super-admin/departments').then((res) => {
      setDepartments(res.data ?? []);
      if (res.data?.[0] && !form.departmentId) {
        setForm((f) => ({ ...f, departmentId: res.data![0].id }));
      }
    });
  }, []);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function createStudent(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      const res = await api<{ temporaryPassword: string }>('/super-admin/students', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          year: Number(form.year) || 1,
        }),
      });
      setTempPw(res.data?.temporaryPassword ?? form.password);
      setMessage(
        `Student ${form.regNo.toUpperCase()} created in PostgreSQL. They can log in immediately on the AVICHIAN app with Register Number + temporary password (no server restart needed).`,
      );
      setShowCreate(false);
      setForm((f) => ({ ...f, regNo: '', name: '', email: '', mobile: '', password: generateTempPassword() }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function resetPassword(s: Student) {
    const password = window.prompt(`Temporary password for ${s.regNo} (min 8 chars)`, generateTempPassword());
    if (!password) return;
    try {
      const res = await api<{ temporaryPassword: string }>(
        `/super-admin/students/${s.id}/reset-password`,
        { method: 'POST', body: JSON.stringify({ password }) },
      );
      setTempPw(res.data?.temporaryPassword ?? password);
      setMessage(`Password reset for ${s.regNo}. Student must change password on next login.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    }
  }

  async function suspend(s: Student) {
    const reason = window.prompt('Suspension reason', 'Misconduct') ?? 'Misconduct';
    await api(`/super-admin/students/${s.id}/suspend`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    setMessage(`${s.regNo} suspended`);
    load();
  }

  async function activate(s: Student) {
    await api(`/super-admin/students/${s.id}/activate`, { method: 'POST' });
    setMessage(`${s.regNo} reactivated`);
    load();
  }

  async function unlock(s: Student) {
    await api(`/super-admin/students/${s.id}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Admin unlock from student list' }),
    });
    setMessage(`${s.regNo} unlocked — failed attempts cleared`);
    load();
  }

  async function remove(s: Student) {
    if (!window.confirm(`Soft-delete ${s.name} (${s.regNo})?`)) return;
    await api(`/super-admin/students/${s.id}`, { method: 'DELETE' });
    setMessage(`${s.regNo} deleted`);
    load();
  }

  async function logoutAll(s: Student) {
    await api(`/super-admin/students/${s.id}/logout-all`, { method: 'POST' });
    setMessage(`Logged out ${s.regNo} from all devices`);
  }

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold sm:text-2xl">Student Management</h1>
          <p className="text-sm opacity-60">Total students: {total}</p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setShowCreate((v) => !v)}>
          <UserPlus size={16} className="mr-2 inline" />
          Create Student
        </Button>
      </div>

      {message ? (
        <div className="rounded-[20px] bg-success/10 px-4 py-3 text-sm text-success">
          {message}
          {tempPw ? (
            <p className="mt-1 font-mono text-slate-800">
              Temporary password (shown once): <strong>{tempPw}</strong>
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p> : null}

      {showCreate ? (
        <form onSubmit={createStudent} className="glass-card space-y-3 rounded-[24px] p-5 shadow-soft">
          <h2 className="font-semibold">Create student account</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="Register Number" value={form.regNo} onChange={(e) => setForm({ ...form, regNo: e.target.value.toUpperCase() })} required />
            <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Input label="College Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <Input label="Mobile" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required />
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">Department</span>
              <select
                className="min-h-12 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-sm"
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                required
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            <Input label="Year" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} />
            <Input label="Initial Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </div>
          <p className="text-xs text-slate-400">Student must change password on first login.</p>
          <div className="flex gap-2">
            <Button type="submit" className="w-auto">Create &amp; Activate</Button>
            <Button type="button" variant="secondary" className="w-auto" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </form>
      ) : null}

      <div className="relative max-w-md">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search student name, reg no, email…"
          className="w-full rounded-[20px] border border-slate-200 bg-white/80 py-3 pl-11 pr-4 text-sm"
        />
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-[28px] bg-slate-100" />
      ) : students.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No students found" description="Create a student or wait for registrations." />
      ) : (
        <div className="space-y-3">
          {students.map((s) => (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/students/${s.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  navigate(`/students/${s.id}`);
                }
              }}
              className="glass-card cursor-pointer rounded-[24px] p-5 shadow-soft transition hover:ring-2 hover:ring-primary/20"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{s.name}</p>
                  <p className="text-sm text-slate-500">
                    Reg No: <span className="font-mono">{s.regNo}</span>
                  </p>
                  <p className="text-sm text-slate-500">Department: {s.department}</p>
                  <p className="text-sm text-slate-500">Email: {s.email}</p>
                  <p className="mt-1 text-xs">
                    Status:{' '}
                    <span className={s.status === 'ACTIVE' ? 'text-success font-medium' : 'text-error font-medium'}>
                      {s.status}
                    </span>
                    {s.isLocked ? (
                      <span className="ml-1 font-medium text-error">
                        · Locked
                        {s.lockedUntil ? ` until ${new Date(s.lockedUntil).toLocaleString()}` : ''}
                      </span>
                    ) : null}
                    {(s.failedLoginCount ?? 0) > 0 && !s.isLocked ? (
                      <span className="ml-1 text-warning">· {s.failedLoginCount} failed attempts</span>
                    ) : null}
                    {s.online ? ' · Online' : ''}
                    {s.lastLoginAt ? ` · Last login ${new Date(s.lastLoginAt).toLocaleString()}` : ''}
                  </p>
                  <p className="mt-2 text-xs font-medium text-primary">Open full profile →</p>
                </div>
                <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  {s.status === 'ACTIVE' ? (
                    <button type="button" onClick={() => suspend(s)} className="rounded-full bg-warning/15 px-3 py-1.5 text-xs font-medium text-warning">
                      Suspend
                    </button>
                  ) : (
                    <button type="button" onClick={() => activate(s)} className="rounded-full bg-success/15 px-3 py-1.5 text-xs font-medium text-success">
                      Reactivate
                    </button>
                  )}
                  {(s.isLocked || (s.failedLoginCount ?? 0) > 0) ? (
                    <button type="button" onClick={() => void unlock(s)} className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800">
                      Unlock Account
                    </button>
                  ) : null}
                  <button type="button" onClick={() => resetPassword(s)} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
                    <KeyRound size={12} /> Reset Password
                  </button>
                  <button type="button" onClick={() => logoutAll(s)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium">
                    Logout All Devices
                  </button>
                  <button type="button" onClick={() => remove(s)} className="rounded-full bg-error/10 px-3 py-1.5 text-xs font-medium text-error">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
