import { isValidPasswordDetailed } from '@avichian/shared';
import { Settings, ShieldPlus, UserCog } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { GlassCard } from '../../components/ui/GlassCard';
import { Input } from '../../components/ui/Input';
import { api } from '../../lib/api';

interface AdminRow {
  id: string;
  employeeId: string;
  name: string;
  email: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export function SettingsPage() {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    employeeId: '',
    email: '',
    mobile: '',
    password: '',
    confirmPassword: '',
  });

  const loadAdmins = useCallback(async () => {
    try {
      const res = await api<AdminRow[]>('/super-admin/admins');
      setAdmins(res.data ?? []);
    } catch {
      /* older API */
    }
  }, []);

  useEffect(() => {
    void loadAdmins();
    void api('/super-admin/admins/repair-roles', { method: 'POST' }).catch(() => undefined);
  }, [loadAdmins]);

  async function createAdmin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    const pw = isValidPasswordDetailed(form.password);
    if (!pw.valid) {
      setError(`Password requirements: ${pw.errors.join(', ')}`);
      return;
    }
    setSaving(true);
    try {
      const res = await api<{ employeeId: string; loginHint: string }>('/super-admin/admins', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          employeeId: form.employeeId.trim(),
          email: form.email.trim(),
          mobile: form.mobile.trim() || null,
          password: form.password,
          confirmPassword: form.confirmPassword,
        }),
      });
      setMessage(
        `Super Admin ${res.data?.employeeId} created. They can log in immediately on the Super Admin portal.`,
      );
      setForm({
        name: '',
        employeeId: '',
        email: '',
        mobile: '',
        password: '',
        confirmPassword: '',
      });
      await loadAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  const sections = [
    { title: 'App', fields: ['App Name: Avichian', 'College: Avichi Arts and Science College'] },
    {
      title: 'Security',
      fields: [
        'Passwords: bcrypt hashed in PostgreSQL',
        'Student OTP Expiry: 5 min',
        'Lockout (production): 5 attempts / 15 min',
      ],
    },
    {
      title: 'Registration',
      fields: ['Domain: @avichi.edu', 'Admin-created students can log in immediately'],
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">System Settings</h1>

      {message ? (
        <div className="rounded-[20px] bg-success/10 px-4 py-3 text-sm text-success">{message}</div>
      ) : null}
      {error ? <p className="rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p> : null}

      <GlassCard>
        <div className="mb-4 flex items-center gap-2 text-slate-800">
          <ShieldPlus size={18} className="text-primary" />
          <h2 className="font-semibold">Create Super Admin</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          Only existing Super Admins can create another Super Admin. Password is hashed and stored
          in PostgreSQL. Role = SUPER_ADMIN.
        </p>
        <form onSubmit={createAdmin} className="grid gap-3 md:grid-cols-2">
          <Input
            label="Full Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            label="Employee ID"
            value={form.employeeId}
            onChange={(e) => setForm({ ...form, employeeId: e.target.value.toUpperCase() })}
            placeholder="SA006"
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
            label="Mobile (optional)"
            value={form.mobile}
            onChange={(e) => setForm({ ...form, mobile: e.target.value })}
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            autoComplete="new-password"
            required
          />
          <Input
            label="Confirm Password"
            type="password"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            autoComplete="new-password"
            required
          />
          <div className="md:col-span-2">
            <Button type="submit" className="w-auto" loading={saving}>
              Create Super Admin
            </Button>
          </div>
        </form>
      </GlassCard>

      <GlassCard>
        <div className="mb-4 flex items-center gap-2 text-slate-800">
          <UserCog size={18} className="text-primary" />
          <h2 className="font-semibold">Super Admins</h2>
        </div>
        {admins.length === 0 ? (
          <p className="text-sm text-slate-500">No admins loaded.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {admins.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900">{a.name}</p>
                  <p className="text-xs text-slate-500">
                    {a.employeeId} · {a.email} · {a.status}
                  </p>
                </div>
                <span className="text-xs text-slate-400">
                  {a.lastLoginAt
                    ? `Last login ${new Date(a.lastLoginAt).toLocaleString()}`
                    : 'Never logged in'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      {sections.map((s) => (
        <GlassCard key={s.title}>
          <div className="flex items-center gap-2 text-slate-800">
            <Settings size={18} className="text-primary" />
            <h2 className="font-semibold">{s.title}</h2>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            {s.fields.map((f) => (
              <li key={f} className="rounded-xl bg-slate-50 px-4 py-2">
                {f}
              </li>
            ))}
          </ul>
        </GlassCard>
      ))}
    </div>
  );
}
