import {
  Download,
  GraduationCap,
  History,
  KeyRound,
  Search,
  Upload,
  UserPlus,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { isValidPasswordDetailed } from '@avichian/shared';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { EmptyState } from '../../components/admin/EmptyState';
import { api, getAccessToken, prefetchCsrfToken } from '../../lib/api';
import { getApiBase } from '../../lib/config';
import { BulkImportStudents } from './BulkImportStudents';

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
  section?: string | null;
  isLocked?: boolean;
  lockedUntil?: string | null;
  failedLoginCount?: number;
  forcePasswordChange?: boolean;
  neverLoggedIn?: boolean;
  createdAt?: string;
}

interface Department {
  id: string;
  name: string;
}

interface Stats {
  total: number;
  active: number;
  suspended: number;
  neverLoggedIn: number;
  notActivated: number;
}

interface ImportHistoryRow {
  id: string;
  date: string;
  department: string;
  year: number;
  section: string | null;
  totalRows: number;
  created: number;
  skipped: number;
  failed: number;
  status: string;
  admin: string;
}

const emptyForm = {
  regNo: '',
  name: '',
  email: '',
  mobile: '',
  departmentId: '',
  year: '1',
  section: '',
  password: 'Students@2026',
  confirmPassword: 'Students@2026',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
};

type StatusFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'NEVER_LOGGED_IN' | 'NOT_ACTIVATED';

export function StudentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [departmentId, setDepartmentId] = useState('');
  const [year, setYear] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [stats, setStats] = useState<Stats | null>(null);
  const [history, setHistory] = useState<ImportHistoryRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (status !== 'ALL') q.set('status', status);
      if (departmentId) q.set('departmentId', departmentId);
      if (year) q.set('year', year);
      q.set('page', String(page));
      q.set('limit', '40');
      const res = await api<{ items: Student[]; total: number }>(
        `/super-admin/students?${q.toString()}`,
      );
      setStudents(res.data?.items ?? []);
      setTotal(res.data?.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, [search, status, departmentId, year, page]);

  const loadStats = useCallback(async () => {
    try {
      const res = await api<Stats>('/super-admin/students/stats');
      setStats(res.data ?? null);
    } catch {
      /* optional */
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await api<ImportHistoryRow[]>('/super-admin/students/import/history');
      setHistory(res.data ?? []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    api<Department[]>('/super-admin/departments').then((res) => {
      setDepartments(res.data ?? []);
      if (res.data?.[0]) {
        setForm((f) => (f.departmentId ? f : { ...f, departmentId: res.data![0].id }));
      }
    });
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    const t = setTimeout(load, 280);
    return () => clearTimeout(t);
  }, [load]);

  // Auto email from reg no when admin hasn't typed a custom email
  useEffect(() => {
    const reg = form.regNo.trim().toLowerCase();
    if (!reg) return;
    const domain = 'avichi.edu';
    const auto = `${reg}@${domain}`;
    setForm((f) => {
      const current = f.email.trim().toLowerCase();
      if (!current || current.endsWith(`@${domain}`)) {
        return { ...f, email: auto };
      }
      return f;
    });
  }, [form.regNo]);

  async function createStudent(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (form.password !== form.confirmPassword) {
      setError('Password and Confirm Password do not match');
      return;
    }
    const pw = isValidPasswordDetailed(form.password);
    if (!pw.valid) {
      setError(`Password requirements: ${pw.errors.join(', ')}`);
      return;
    }
    setCreating(true);
    try {
      const res = await api<{ regNo: string; loginHint: string }>('/super-admin/students', {
        method: 'POST',
        body: JSON.stringify({
          regNo: form.regNo.trim(),
          name: form.name.trim(),
          email: form.email.trim(),
          mobile: form.mobile.trim() || null,
          departmentId: form.departmentId,
          year: Number(form.year) || 1,
          section: form.section.trim() || null,
          password: form.password,
          confirmPassword: form.confirmPassword,
          status: form.status,
        }),
      });
      const reg = res.data?.regNo ?? form.regNo.toUpperCase();
      setMessage(
        `Student ${reg} created. Share temporary password securely. ` +
          (res.data?.loginHint ?? 'They must change password on first login.'),
      );
      setShowCreate(false);
      setForm((f) => ({
        ...emptyForm,
        departmentId: f.departmentId || departments[0]?.id || '',
      }));
      await load();
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  }

  async function resetPassword(s: Student) {
    const password = window.prompt(
      `Temporary password for ${s.regNo}\n(min 8 chars, upper, lower, number, special)`,
      'Students@2026',
    );
    if (!password) return;
    const confirm = window.prompt('Confirm new password', password);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    const pw = isValidPasswordDetailed(password);
    if (!pw.valid) {
      setError(`Password requirements: ${pw.errors.join(', ')}`);
      return;
    }
    try {
      await api(`/super-admin/students/${s.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password, confirmPassword: confirm }),
      });
      setMessage(`Temporary password set for ${s.regNo}. They must change it on next login.`);
      setError('');
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
    void load();
    void loadStats();
  }

  async function activate(s: Student) {
    await api(`/super-admin/students/${s.id}/activate`, { method: 'POST' });
    setMessage(`${s.regNo} reactivated`);
    void load();
    void loadStats();
  }

  async function unlock(s: Student) {
    await api(`/super-admin/students/${s.id}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Admin unlock from student list' }),
    });
    setMessage(`${s.regNo} unlocked`);
    void load();
  }

  async function remove(s: Student) {
    if (!window.confirm(`Soft-delete ${s.name} (${s.regNo})?`)) return;
    await api(`/super-admin/students/${s.id}`, { method: 'DELETE' });
    setMessage(`${s.regNo} deleted`);
    void load();
    void loadStats();
  }

  async function logoutAll(s: Student) {
    await api(`/super-admin/students/${s.id}/logout-all`, { method: 'POST' });
    setMessage(`Logged out ${s.regNo} from all devices`);
  }

  async function exportCsv() {
    try {
      await prefetchCsrfToken();
      const q = new URLSearchParams();
      if (search.trim()) q.set('search', search.trim());
      if (status !== 'ALL') q.set('status', status);
      if (departmentId) q.set('departmentId', departmentId);
      if (year) q.set('year', year);
      const token = getAccessToken();
      const res = await fetch(`${getApiBase()}/super-admin/students/export?${q}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'avichian-students.csv';
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Export downloaded (no passwords included)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  }

  const pwHint = isValidPasswordDetailed(form.password);
  const totalPages = Math.max(1, Math.ceil(total / 40));

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold sm:text-2xl">Student Management</h1>
          <p className="text-sm opacity-60">Provision real accounts · PostgreSQL · force password change</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            className="w-auto"
            variant="secondary"
            onClick={() => {
              setShowCreate(true);
              setShowImport(false);
              setError('');
              setMessage('');
            }}
          >
            <UserPlus size={16} className="mr-2 inline" />
            Add Student
          </Button>
          <Button
            className="w-auto"
            onClick={() => {
              setShowImport(true);
              setShowCreate(false);
              setShowHistory(false);
              setError('');
              setMessage('');
            }}
          >
            <Upload size={16} className="mr-2 inline" />
            Bulk Import
          </Button>
          <Button className="w-auto" variant="ghost" onClick={() => void exportCsv()}>
            <Download size={16} className="mr-2 inline" />
            Export
          </Button>
          <Button
            className="w-auto"
            variant="ghost"
            onClick={() => {
              setShowHistory((v) => !v);
              void loadHistory();
            }}
          >
            <History size={16} className="mr-2 inline" />
            Import History
          </Button>
        </div>
      </div>

      {stats ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Students', value: stats.total },
            { label: 'Active (logged in)', value: stats.active },
            { label: 'Never logged in', value: stats.neverLoggedIn },
            { label: 'Suspended', value: stats.suspended },
          ].map((c) => (
            <div key={c.label} className="glass-card rounded-[1.25rem] p-4 shadow-soft">
              <p className="text-xs font-medium text-slate-500">{c.label}</p>
              <p className="text-2xl font-bold tabular-nums">{c.value.toLocaleString()}</p>
            </div>
          ))}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-[20px] bg-success/10 px-4 py-3 text-sm text-success">{message}</div>
      ) : null}
      {error ? <p className="rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p> : null}

      {showCreate ? (
        <form onSubmit={createStudent} className="glass-card space-y-3 rounded-[24px] p-5 shadow-soft">
          <h2 className="font-semibold">Add student</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Input
              label="Full Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              label="Roll Number"
              value={form.regNo}
              onChange={(e) => setForm({ ...form, regNo: e.target.value.toUpperCase() })}
              placeholder="24VC001"
              required
            />
            <Input
              label="Email (auto from roll if left default)"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <Input
              label="Mobile (optional)"
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
            />
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">Department</span>
              <select
                className="min-h-12 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-sm"
                value={form.departmentId}
                onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                required
              >
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <Input
              label="Year"
              type="number"
              min={1}
              max={6}
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
              required
            />
            <Input
              label="Section"
              value={form.section}
              onChange={(e) => setForm({ ...form, section: e.target.value.toUpperCase() })}
              placeholder="A"
            />
            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-600">Status</span>
              <select
                className="min-h-12 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-sm"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as 'ACTIVE' | 'INACTIVE' })
                }
              >
                <option value="ACTIVE">Active (can log in)</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
            <Input
              label="Temporary Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <Input
              label="Confirm Password"
              type="password"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              required
            />
          </div>
          {form.password ? (
            <ul className="text-xs text-slate-500">
              {pwHint.errors.map((err) => (
                <li key={err} className="text-error">
                  • {err}
                </li>
              ))}
              {pwHint.valid ? <li className="text-success">• Password meets requirements</li> : null}
            </ul>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" className="w-auto" loading={creating}>
              Create student
            </Button>
            <Button type="button" variant="secondary" className="w-auto" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {showHistory ? (
        <div className="glass-card space-y-2 rounded-[24px] p-5">
          <h2 className="font-semibold">Import history</h2>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500">No imports yet</p>
          ) : (
            history.map((h) => (
              <div key={h.id} className="rounded-2xl border border-slate-100 px-3 py-2 text-sm dark:border-zinc-800">
                <p className="font-medium">
                  {new Date(h.date).toLocaleString()} · {h.department} · Year {h.year}
                  {h.section ? ` · Sec ${h.section}` : ''}
                </p>
                <p className="text-xs text-slate-500">
                  {h.totalRows} rows · {h.created} created · {h.skipped} skipped · {h.failed} failed · by{' '}
                  {h.admin}
                </p>
              </div>
            ))
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search name, roll no, email…"
            className="w-full rounded-[20px] border border-slate-200 bg-white/80 py-3 pl-11 pr-4 text-sm"
          />
        </div>
        <select
          className="min-h-11 rounded-[20px] border border-slate-200 bg-white px-3 text-sm"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as StatusFilter);
          }}
        >
          <option value="ALL">All statuses</option>
          <option value="ACTIVE">Active (logged in)</option>
          <option value="NEVER_LOGGED_IN">Never logged in</option>
          <option value="NOT_ACTIVATED">Must change password</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
        <select
          className="min-h-11 rounded-[20px] border border-slate-200 bg-white px-3 text-sm"
          value={departmentId}
          onChange={(e) => {
            setPage(1);
            setDepartmentId(e.target.value);
          }}
        >
          <option value="">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          className="min-h-11 rounded-[20px] border border-slate-200 bg-white px-3 text-sm"
          value={year}
          onChange={(e) => {
            setPage(1);
            setYear(e.target.value);
          }}
        >
          <option value="">All years</option>
          {[1, 2, 3, 4, 5, 6].map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
        </select>
      </div>

      <p className="text-xs text-slate-500">
        Showing {students.length} of {total.toLocaleString()} · page {page}/{totalPages}
      </p>

      {loading ? (
        <div className="h-48 animate-pulse rounded-[28px] bg-slate-100" />
      ) : students.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No students found"
          description="Add one student or bulk import from Excel/CSV."
        />
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
                    Roll: <span className="font-mono">{s.regNo}</span>
                    {s.section ? ` · Sec ${s.section}` : ''}
                    {s.year ? ` · Year ${s.year}` : ''}
                  </p>
                  <p className="text-sm text-slate-500">{s.department}</p>
                  <p className="text-sm text-slate-500">{s.email}</p>
                  <p className="mt-1 text-xs">
                    <span
                      className={
                        s.status === 'ACTIVE' ? 'font-medium text-success' : 'font-medium text-error'
                      }
                    >
                      {s.status}
                    </span>
                    {s.neverLoggedIn ? (
                      <span className="ml-1 text-warning">· Never logged in</span>
                    ) : null}
                    {s.forcePasswordChange ? (
                      <span className="ml-1 text-slate-500">· Must change password</span>
                    ) : null}
                    {s.lastLoginAt
                      ? ` · Last login ${new Date(s.lastLoginAt).toLocaleString()}`
                      : ''}
                  </p>
                  <p className="mt-2 text-xs font-medium text-primary">Open profile →</p>
                </div>
                <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  {s.status === 'ACTIVE' ? (
                    <button
                      type="button"
                      onClick={() => void suspend(s)}
                      className="rounded-full bg-warning/15 px-3 py-1.5 text-xs font-medium text-warning"
                    >
                      Suspend
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void activate(s)}
                      className="rounded-full bg-success/15 px-3 py-1.5 text-xs font-medium text-success"
                    >
                      Activate
                    </button>
                  )}
                  {(s.isLocked || (s.failedLoginCount ?? 0) > 0) ? (
                    <button
                      type="button"
                      onClick={() => void unlock(s)}
                      className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800"
                    >
                      Unlock
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void resetPassword(s)}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
                  >
                    <KeyRound size={12} /> Reset Password
                  </button>
                  <button
                    type="button"
                    onClick={() => void logoutAll(s)}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium"
                  >
                    Logout All
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(s)}
                    className="rounded-full bg-error/10 px-3 py-1.5 text-xs font-medium text-error"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-center gap-2">
          <Button
            type="button"
            variant="secondary"
            className="w-auto"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="secondary"
            className="w-auto"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}

      {showImport ? (
        <BulkImportStudents
          departments={departments}
          onClose={() => setShowImport(false)}
          onDone={(msg) => {
            setMessage(msg);
            void load();
            void loadStats();
            void loadHistory();
          }}
        />
      ) : null}
    </div>
  );
}
