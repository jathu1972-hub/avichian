import {
  Eye,
  KeyRound,
  Pencil,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { isValidPasswordDetailed } from '@avichian/shared';
import { EmptyState } from '../../components/admin/EmptyState';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

type Permissions = {
  studentManagement: boolean;
  communityManagement: boolean;
  events: boolean;
  moderation: boolean;
  reports: boolean;
  settings: boolean;
  superAdminManagement: boolean;
  announcements: boolean;
  passwordReset: boolean;
};

interface SuperAdminRow {
  id: string;
  name: string;
  employeeId: string | null;
  mobile: string | null;
  mobileHint: string;
  email: string;
  username: string;
  profilePhotoUrl: string | null;
  status: string;
  role: string;
  isRoot: boolean;
  permissions: Permissions;
  lastLoginAt: string | null;
  createdBy: { id: string; name: string; username?: string } | null;
  createdAt: string;
  forcePasswordChange: boolean;
  department: string;
}

const PERMISSION_KEYS: { key: keyof Permissions; label: string }[] = [
  { key: 'studentManagement', label: 'Student Management' },
  { key: 'communityManagement', label: 'Community Management' },
  { key: 'events', label: 'Events' },
  { key: 'moderation', label: 'Moderation' },
  { key: 'reports', label: 'Reports' },
  { key: 'settings', label: 'Settings' },
  { key: 'superAdminManagement', label: 'Super Admin Management' },
  { key: 'announcements', label: 'Announcements' },
  { key: 'passwordReset', label: 'Password Reset' },
];

const defaultPermissions = (): Permissions =>
  Object.fromEntries(PERMISSION_KEYS.map((p) => [p.key, true])) as Permissions;

const emptyForm = {
  name: '',
  email: '',
  mobile: '',
  username: '',
  employeeId: '',
  password: '',
  confirmPassword: '',
  profilePhotoUrl: '',
  department: 'Administration',
  status: 'ACTIVE' as 'ACTIVE' | 'INACTIVE',
  permissions: defaultPermissions(),
};

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StatusBadge({ status, isRoot }: { status: string; isRoot: boolean }) {
  if (isRoot) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
        <ShieldCheck size={12} /> Root
      </span>
    );
  }
  const active = status === 'ACTIVE';
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        active
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
          : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200'
      }`}
    >
      {active ? 'Active' : status === 'SUSPENDED' ? 'Suspended' : status}
    </span>
  );
}

export function SuperAdminsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<SuperAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const [viewing, setViewing] = useState<SuperAdminRow | null>(null);
  const [editing, setEditing] = useState<SuperAdminRow | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [resetTarget, setResetTarget] = useState<SuperAdminRow | null>(null);
  const [resetPwd, setResetPwd] = useState({ password: '', confirmPassword: '' });
  const [activity, setActivity] = useState<
    { id: string; action: string; createdAt: string; metadata: unknown }[]
  >([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api<SuperAdminRow[]>(
        `/super-admin/admins?search=${encodeURIComponent(search)}`,
      );
      setItems(res.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Super Admins');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  async function openView(row: SuperAdminRow) {
    setViewing(row);
    try {
      const res = await api<typeof activity>(`/super-admin/admins/${row.id}/activity?limit=30`);
      setActivity(res.data ?? []);
    } catch {
      setActivity([]);
    }
  }

  function openEdit(row: SuperAdminRow) {
    setEditing(row);
    setEditForm({
      name: row.name,
      email: row.email,
      mobile: row.mobile ?? '',
      username: row.username,
      employeeId: row.employeeId ?? '',
      password: '',
      confirmPassword: '',
      profilePhotoUrl: row.profilePhotoUrl ?? '',
      department: row.department || 'Administration',
      status: row.status === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
      permissions: { ...defaultPermissions(), ...row.permissions },
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    const pwd = isValidPasswordDetailed(form.password);
    if (!pwd.valid) {
      setError(`Password: ${pwd.errors.join(', ')}`);
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    try {
      await api('/super-admin/admins', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          mobile: form.mobile || null,
          username: form.username,
          employeeId: form.employeeId || null,
          password: form.password,
          confirmPassword: form.confirmPassword,
          profilePhotoUrl: form.profilePhotoUrl || null,
          department: form.department,
          permissions: form.permissions,
          status: form.status,
        }),
      });
      setMessage('Super Admin created successfully');
      setShowCreate(false);
      setForm(emptyForm);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    setError('');
    try {
      await api(`/super-admin/admins/${editing.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          mobile: editForm.mobile || null,
          username: editForm.username,
          employeeId: editForm.employeeId || null,
          profilePhotoUrl: editForm.profilePhotoUrl || null,
          permissions: editForm.permissions,
          status: editForm.status,
        }),
      });
      setMessage('Super Admin updated');
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    if (!resetTarget) return;
    const pwd = isValidPasswordDetailed(resetPwd.password);
    if (!pwd.valid) {
      setError(`Password: ${pwd.errors.join(', ')}`);
      return;
    }
    if (resetPwd.password !== resetPwd.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api(`/super-admin/admins/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify(resetPwd),
      });
      setMessage(`Password reset for ${resetTarget.username}. They must change it on next login.`);
      setResetTarget(null);
      setResetPwd({ password: '', confirmPassword: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSuspend(row: SuperAdminRow) {
    if (row.isRoot) return;
    if (!confirm(`Suspend Super Admin ${row.username}?`)) return;
    try {
      await api(`/super-admin/admins/${row.id}/suspend`, { method: 'POST' });
      setMessage(`${row.username} suspended`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Suspend failed');
    }
  }

  async function handleActivate(row: SuperAdminRow) {
    try {
      await api(`/super-admin/admins/${row.id}/activate`, { method: 'POST' });
      setMessage(`${row.username} activated`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activate failed');
    }
  }

  async function handleDelete(row: SuperAdminRow) {
    if (row.isRoot) return;
    if (row.id === user?.id) {
      setError('You cannot delete your own account');
      return;
    }
    if (
      !confirm(
        `Delete Super Admin "${row.name}" (${row.username})?\n\nThis cannot be undone. Root account is always protected.`,
      )
    ) {
      return;
    }
    try {
      await api(`/super-admin/admins/${row.id}`, { method: 'DELETE' });
      setMessage(`${row.username} deleted`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  function PermissionChecks({
    value,
    onChange,
  }: {
    value: Permissions;
    onChange: (p: Permissions) => void;
  }) {
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        {PERMISSION_KEYS.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value[key]}
              onChange={(e) => onChange({ ...value, [key]: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300"
            />
            {label}
          </label>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Super Admins</h1>
          <p className="mt-1 text-sm opacity-60">
            Manage Super Admin accounts. Root Super Admin is permanently protected.
          </p>
        </div>
        <Button
          onClick={() => {
            setShowCreate(true);
            setForm(emptyForm);
            setError('');
          }}
        >
          <Plus size={16} className="mr-2 inline" />
          Create Super Admin
        </Button>
      </div>

      {message ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      <div className="flex gap-3">
        <Input
          label=""
          placeholder="Search name, email, username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {showCreate ? (
        <form onSubmit={handleCreate} className="glass-card space-y-4 rounded-[28px] p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Create Super Admin</h2>
            <button type="button" onClick={() => setShowCreate(false)} aria-label="Close">
              <X size={18} />
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Full Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <Input
              label="Email Address"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <Input
              label="Mobile Number"
              value={form.mobile}
              onChange={(e) => setForm({ ...form, mobile: e.target.value })}
              placeholder="10-digit mobile"
            />
            <Input
              label="Username"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
              required
            />
            <Input
              label="Employee ID (optional)"
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value.toUpperCase() })}
            />
            <Input
              label="Department"
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            />
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
            <Input
              label="Profile Photo URL"
              value={form.profilePhotoUrl}
              onChange={(e) => setForm({ ...form, profilePhotoUrl: e.target.value })}
              placeholder="https://…"
            />
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Status</span>
              <select
                className="w-full rounded-[20px] border border-slate-200 px-4 py-3 dark:border-slate-600 dark:bg-slate-800"
                value={form.status}
                onChange={(e) =>
                  setForm({ ...form, status: e.target.value as 'ACTIVE' | 'INACTIVE' })
                }
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
            </label>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Role: Super Admin</p>
            <p className="mb-2 text-sm font-medium">Permissions</p>
            <PermissionChecks
              value={form.permissions}
              onChange={(permissions) => setForm({ ...form, permissions })}
            />
          </div>
          <div className="flex gap-3">
            <Button type="submit" loading={saving}>
              Save Super Admin
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {loading ? (
        <div className="h-48 animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No Super Admins"
          description="Create Super Admin accounts here. Root Super Admin is always protected."
        />
      ) : (
        <div className="glass-card overflow-x-auto rounded-[28px]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200/80 text-xs uppercase tracking-wide opacity-60 dark:border-slate-700">
              <tr>
                <th className="px-4 py-3 font-semibold">Photo</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Employee ID</th>
                <th className="px-4 py-3 font-semibold">Mobile</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Username</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Last Login</th>
                <th className="px-4 py-3 font-semibold">Created By</th>
                <th className="px-4 py-3 font-semibold">Created</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-primary/5">
                  <td className="px-4 py-3">
                    {row.profilePhotoUrl ? (
                      <img
                        src={row.profilePhotoUrl}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {row.name.slice(0, 1)}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {row.name}
                    {row.isRoot ? (
                      <span className="ml-1 text-xs text-amber-600">· Root</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 opacity-80">{row.employeeId || '—'}</td>
                  <td className="px-4 py-3 opacity-80">{row.mobileHint}</td>
                  <td className="px-4 py-3 opacity-80">{row.email}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.username}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} isRoot={row.isRoot} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs opacity-70">
                    {fmtDate(row.lastLoginAt)}
                  </td>
                  <td className="px-4 py-3 text-xs opacity-70">
                    {row.createdBy?.name ?? (row.isRoot ? 'System' : '—')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs opacity-70">
                    {fmtDate(row.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        title="View"
                        className="rounded-lg p-1.5 hover:bg-primary/10"
                        onClick={() => void openView(row)}
                      >
                        <Eye size={15} />
                      </button>
                      <button
                        type="button"
                        title="Edit"
                        className="rounded-lg p-1.5 hover:bg-primary/10"
                        onClick={() => openEdit(row)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        title="Reset Password"
                        className="rounded-lg p-1.5 hover:bg-primary/10"
                        onClick={() => {
                          setResetTarget(row);
                          setResetPwd({ password: '', confirmPassword: '' });
                        }}
                      >
                        <KeyRound size={15} />
                      </button>
                      {row.status === 'ACTIVE' ? (
                        <button
                          type="button"
                          title="Suspend"
                          disabled={row.isRoot || row.id === user?.id}
                          className="rounded-lg p-1.5 hover:bg-rose-100 disabled:opacity-30"
                          onClick={() => void handleSuspend(row)}
                        >
                          <UserX size={15} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          title="Activate"
                          className="rounded-lg p-1.5 hover:bg-emerald-100"
                          onClick={() => void handleActivate(row)}
                        >
                          <UserCheck size={15} />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Delete"
                        disabled={row.isRoot || row.id === user?.id}
                        className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-100 disabled:opacity-30"
                        onClick={() => void handleDelete(row)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* View drawer */}
      {viewing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="glass-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[28px] p-6">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold">{viewing.name}</h2>
                <p className="text-sm opacity-60">@{viewing.username}</p>
              </div>
              <button type="button" onClick={() => setViewing(null)}>
                <X size={18} />
              </button>
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="opacity-60">Email</dt>
                <dd>{viewing.email}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="opacity-60">Employee ID</dt>
                <dd>{viewing.employeeId || '—'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="opacity-60">Role</dt>
                <dd>{viewing.isRoot ? 'Root Super Admin' : 'Super Admin'}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="opacity-60">Status</dt>
                <dd>
                  <StatusBadge status={viewing.status} isRoot={viewing.isRoot} />
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="opacity-60">Last login</dt>
                <dd>{fmtDate(viewing.lastLoginAt)}</dd>
              </div>
            </dl>
            <h3 className="mb-2 mt-6 text-sm font-semibold">Permissions</h3>
            <ul className="grid grid-cols-2 gap-1 text-xs">
              {PERMISSION_KEYS.map(({ key, label }) => (
                <li key={key} className={viewing.permissions?.[key] ? 'text-emerald-600' : 'opacity-40'}>
                  {viewing.permissions?.[key] ? '✓' : '·'} {label}
                </li>
              ))}
            </ul>
            <h3 className="mb-2 mt-6 text-sm font-semibold">Recent activity</h3>
            {activity.length === 0 ? (
              <p className="text-xs opacity-50">No recent audit events</p>
            ) : (
              <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
                {activity.map((a) => (
                  <li key={a.id} className="flex justify-between gap-2 border-b border-slate-100 py-1 dark:border-slate-800">
                    <span>{a.action}</span>
                    <span className="opacity-50">{fmtDate(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}

      {/* Edit modal */}
      {editing ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <form
            onSubmit={handleEdit}
            className="glass-card max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-[28px] p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Edit Super Admin</h2>
              <button type="button" onClick={() => setEditing(null)}>
                <X size={18} />
              </button>
            </div>
            <Input
              label="Full Name"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              required
            />
            <Input
              label="Email"
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              required
            />
            <Input
              label="Username"
              value={editForm.username}
              onChange={(e) => setEditForm({ ...editForm, username: e.target.value.toLowerCase() })}
              required
              disabled={editing.isRoot}
            />
            <Input
              label="Mobile"
              value={editForm.mobile}
              onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })}
            />
            <Input
              label="Employee ID"
              value={editForm.employeeId}
              onChange={(e) => setEditForm({ ...editForm, employeeId: e.target.value.toUpperCase() })}
            />
            {!editing.isRoot ? (
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Status</span>
                <select
                  className="w-full rounded-[20px] border border-slate-200 px-4 py-3 dark:border-slate-600 dark:bg-slate-800"
                  value={editForm.status}
                  onChange={(e) =>
                    setEditForm({ ...editForm, status: e.target.value as 'ACTIVE' | 'INACTIVE' })
                  }
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive / Suspended</option>
                </select>
              </label>
            ) : null}
            <div>
              <p className="mb-2 text-sm font-medium">Permissions</p>
              <PermissionChecks
                value={editForm.permissions}
                onChange={(permissions) => setEditForm({ ...editForm, permissions })}
              />
            </div>
            <div className="flex gap-3">
              <Button type="submit" loading={saving}>
                Save changes
              </Button>
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Reset password modal */}
      {resetTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <form
            onSubmit={handleReset}
            className="glass-card w-full max-w-md space-y-4 rounded-[28px] p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Reset password</h2>
              <button type="button" onClick={() => setResetTarget(null)}>
                <X size={18} />
              </button>
            </div>
            <p className="text-sm opacity-70">
              Set a temporary password for <strong>@{resetTarget.username}</strong>. They will be
              forced to change it on next login.
            </p>
            <Input
              label="Temporary Password"
              type="password"
              value={resetPwd.password}
              onChange={(e) => setResetPwd({ ...resetPwd, password: e.target.value })}
              required
            />
            <Input
              label="Confirm Password"
              type="password"
              value={resetPwd.confirmPassword}
              onChange={(e) => setResetPwd({ ...resetPwd, confirmPassword: e.target.value })}
              required
            />
            <div className="flex gap-3">
              <Button type="submit" loading={saving}>
                Save temporary password
              </Button>
              <Button type="button" variant="secondary" onClick={() => setResetTarget(null)}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
