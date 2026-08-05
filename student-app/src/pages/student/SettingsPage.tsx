import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Bell,
  ChevronRight,
  HardDrive,
  HelpCircle,
  History,
  Lock,
  LogOut,
  Moon,
  Palette,
  Phone,
  Search,
  Shield,
  Smartphone,
  Sun,
  User,
  X,
  KeyRound,
  Monitor,
  Volume2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isValidPasswordDetailed } from '@avichian/shared';
import { useAuth } from '../../context/AuthContext';
import {
  type SettingsBundle,
  changePassword,
  fetchLoginHistory,
  fetchSettings,
  formatBytes,
  logoutAllDevices,
  updateAppearance,
  updateNotifications,
  updatePrivacy,
} from '../../lib/settings';
import {
  getRingtoneDisplayName,
  isRingtoneEnabled,
  isVibrateEnabled,
  setRingtoneEnabled,
  setVibrateEnabled,
  testIncomingRingtone,
} from '../../lib/ringtone';
import { PasswordHint } from '../LoginPage';

type SectionId =
  | 'account'
  | 'privacy'
  | 'notifications'
  | 'calls'
  | 'appearance'
  | 'security'
  | 'storage'
  | 'support';

type SettingsRow = {
  label: string;
  desc?: string;
  keywords?: string;
  to?: string;
  onClick?: () => void;
  toggle?: boolean;
  onToggle?: (v: boolean) => void;
  select?: {
    value: string;
    options: Array<{ v: string; l: string }>;
    onChange: (v: string) => void;
  };
  danger?: boolean;
};

type SettingsSection = {
  id: SectionId;
  title: string;
  icon: typeof User;
  accent: string;
  rows: SettingsRow[];
  custom?: 'appearance' | 'storage' | 'calls';
  keywords?: string;
};

export function SettingsPage() {
  const { user, logout, logoutAll } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<SettingsBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [query, setQuery] = useState('');
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [logoutAllOpen, setLogoutAllOpen] = useState(false);
  const [ringtoneOn, setRingtoneOn] = useState(() => isRingtoneEnabled());
  const [vibrateOn, setVibrateOn] = useState(() => isVibrateEnabled());
  const [ringtoneTestMsg, setRingtoneTestMsg] = useState('');
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<
    Array<{ id: string; success: boolean; ipAddress: string | null; createdAt: string; userAgent: string | null }>
  >([]);
  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' });
  const [pwdError, setPwdError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const bundle = await fetchSettings();
      setData(bundle);
      applyTheme(bundle.appearance.theme);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2400);
  }

  function applyTheme(theme: string) {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      localStorage.setItem('student-theme', 'dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
      localStorage.setItem('student-theme', 'light');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
      localStorage.setItem('student-theme', 'system');
    }
  }

  async function patchPrivacy(partial: Partial<SettingsBundle['privacy']>) {
    if (!data) return;
    const prev = data.privacy;
    setData({ ...data, privacy: { ...prev, ...partial } });
    try {
      const next = await updatePrivacy(partial);
      setData((d) => (d ? { ...d, privacy: next } : d));
      flash('Privacy updated');
    } catch (err) {
      setData((d) => (d ? { ...d, privacy: prev } : d));
      flash(err instanceof Error ? err.message : 'Update failed');
    }
  }

  async function patchNotif(key: keyof SettingsBundle['notifications'], value: boolean) {
    if (!data) return;
    const prev = data.notifications;
    setData({ ...data, notifications: { ...prev, [key]: value } });
    try {
      const next = await updateNotifications({ [key]: value });
      setData((d) => (d ? { ...d, notifications: next } : d));
    } catch {
      setData((d) => (d ? { ...d, notifications: prev } : d));
      flash('Could not save notification preference');
    }
  }

  async function setTheme(theme: string) {
    if (!data) return;
    const prev = data.appearance;
    setData({ ...data, appearance: { ...prev, theme } });
    applyTheme(theme);
    try {
      const next = await updateAppearance({ theme });
      setData((d) => (d ? { ...d, appearance: next } : d));
      flash('Appearance saved');
    } catch {
      setData((d) => (d ? { ...d, appearance: prev } : d));
      applyTheme(prev.theme);
      flash('Could not save appearance');
    }
  }

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwdError('');
    if (pwd.next !== pwd.confirm) {
      setPwdError('Passwords do not match');
      return;
    }
    if (pwd.next === pwd.current) {
      setPwdError('New password must be different from current');
      return;
    }
    setBusy(true);
    try {
      const res = await changePassword(pwd.current, pwd.next);
      setPasswordOpen(false);
      setPwd({ current: '', next: '', confirm: '' });
      flash(res.data && typeof res.data === 'object' && 'message' in (res.data as object)
        ? String((res.data as { message: string }).message)
        : 'Password changed');
    } catch (err) {
      setPwdError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function doLogout() {
    await logout();
    navigate('/login');
  }

  async function doLogoutAll() {
    setBusy(true);
    try {
      await logoutAllDevices();
      await logoutAll();
      navigate('/login');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Failed');
      setBusy(false);
    }
  }

  async function openHistory() {
    setHistoryOpen(true);
    try {
      setHistory(await fetchLoginHistory());
    } catch {
      setHistory([]);
    }
  }

  const sections: SettingsSection[] = useMemo(() => {
    if (!data) return [];
    return [
      {
        id: 'account' as SectionId,
        title: 'Account',
        icon: User,
        accent: 'from-sky-500 to-blue-600',
        rows: [
          {
            label: 'Edit profile',
            desc: 'Photo, cover, bio',
            to: '/home/profile',
            keywords: 'profile photo bio name',
          },
          {
            label: 'Name',
            desc: data.account.name,
            keywords: 'name account',
          },
          {
            label: 'Register number',
            desc: data.account.regNo,
            keywords: 'reg register',
          },
          {
            label: 'Email',
            desc: data.account.email,
            keywords: 'email',
          },
          {
            label: 'Department',
            desc: data.account.department,
            keywords: 'department',
          },
          {
            label: 'Change password',
            desc: 'Update your login password',
            onClick: () => setPasswordOpen(true),
            keywords: 'password security',
          },
        ],
      },
      {
        id: 'privacy' as SectionId,
        title: 'Privacy',
        icon: Shield,
        accent: 'from-violet-500 to-purple-600',
        rows: [
          {
            label: 'Private account',
            desc: 'Limit who can find and interact with you',
            toggle: data.privacy.privateAccount,
            onToggle: (v: boolean) => void patchPrivacy({ privateAccount: v }),
            keywords: 'private account privacy',
          },
          {
            label: 'Who can message me',
            desc: data.privacy.whoCanMessage,
            select: {
              value: data.privacy.whoCanMessage,
              options: [
                { v: 'EVERYONE', l: 'Everyone' },
                { v: 'FRIENDS', l: 'Friends only' },
                { v: 'NOBODY', l: 'Nobody' },
              ],
              onChange: (v: string) => void patchPrivacy({ whoCanMessage: v }),
            },
            keywords: 'message chat',
          },
          {
            label: 'Who can call me',
            desc: data.privacy.whoCanCall,
            select: {
              value: data.privacy.whoCanCall,
              options: [
                { v: 'EVERYONE', l: 'Everyone' },
                { v: 'FRIENDS', l: 'Friends only' },
                { v: 'NOBODY', l: 'Nobody' },
              ],
              onChange: (v: string) => void patchPrivacy({ whoCanCall: v }),
            },
            keywords: 'call voice video',
          },
          {
            label: 'Who can see my posts',
            desc: data.privacy.whoCanSeePosts,
            select: {
              value: data.privacy.whoCanSeePosts,
              options: [
                { v: 'PUBLIC', l: 'Public' },
                { v: 'FRIENDS', l: 'Friends' },
                { v: 'DEPARTMENT', l: 'Department' },
                { v: 'PRIVATE', l: 'Only me' },
              ],
              onChange: (v: string) => void patchPrivacy({ whoCanSeePosts: v }),
            },
            keywords: 'posts visibility',
          },
          {
            label: 'Who can see my stories',
            desc: data.privacy.whoCanSeeStories,
            select: {
              value: data.privacy.whoCanSeeStories,
              options: [
                { v: 'PUBLIC', l: 'Public' },
                { v: 'FRIENDS', l: 'Friends' },
                { v: 'DEPARTMENT', l: 'Department' },
                { v: 'PRIVATE', l: 'Only me' },
              ],
              onChange: (v: string) => void patchPrivacy({ whoCanSeeStories: v }),
            },
            keywords: 'stories visibility',
          },
          {
            label: 'Who can see my profile',
            desc: data.privacy.whoCanSeeProfile,
            select: {
              value: data.privacy.whoCanSeeProfile,
              options: [
                { v: 'PUBLIC', l: 'Public' },
                { v: 'FRIENDS', l: 'Friends' },
                { v: 'PRIVATE', l: 'Only me' },
              ],
              onChange: (v: string) => void patchPrivacy({ whoCanSeeProfile: v }),
            },
            keywords: 'profile visibility',
          },
          {
            label: 'Blocked users',
            desc: 'Manage blocked students',
            to: '/home/friends',
            keywords: 'block blocked',
          },
        ],
      },
      {
        id: 'notifications' as SectionId,
        title: 'Notifications',
        icon: Bell,
        accent: 'from-amber-500 to-orange-500',
        rows: (
          [
            ['likes', 'Likes'],
            ['comments', 'Comments'],
            ['friendRequests', 'Friend requests'],
            ['messages', 'Messages'],
            ['calls', 'Calls'],
            ['events', 'Events'],
            ['communities', 'Communities'],
            ['announcements', 'Announcements'],
            ['reminders', 'Reminders'],
            ['pushEnabled', 'Push notifications'],
          ] as const
        ).map(([key, label]) => ({
          label,
          desc: data.notifications[key] ? 'On' : 'Off',
          toggle: data.notifications[key],
          onToggle: (v: boolean) => void patchNotif(key, v),
          keywords: `notify ${label}`,
        })),
      },
      {
        id: 'calls' as SectionId,
        title: 'Call Settings',
        icon: Phone,
        accent: 'from-emerald-500 to-green-600',
        rows: [],
        custom: 'calls' as const,
        keywords: 'ringtone call voice video vibration incoming',
      },
      {
        id: 'appearance' as SectionId,
        title: 'Appearance',
        icon: Palette,
        accent: 'from-pink-500 to-rose-500',
        rows: [],
        custom: 'appearance' as const,
      },
      {
        id: 'security' as SectionId,
        title: 'Security',
        icon: Lock,
        accent: 'from-emerald-500 to-teal-600',
        rows: [
          {
            label: 'Account status',
            desc: data.account.accountStatus,
            keywords: 'status lock',
          },
          {
            label: 'Two-factor authentication',
            desc: data.account.mfaEnabled ? 'Enabled' : 'Not enabled',
            keywords: 'mfa 2fa',
          },
          {
            label: 'Active sessions',
            desc: `${data.sessions.length} device(s)`,
            keywords: 'sessions devices',
          },
          {
            label: 'Login history',
            desc: 'Recent sign-in activity',
            onClick: () => void openHistory(),
            keywords: 'history login',
          },
          {
            label: 'Log out all devices',
            desc: 'Revoke every active session',
            onClick: () => setLogoutAllOpen(true),
            danger: true,
            keywords: 'logout all devices',
          },
        ],
      },
      {
        id: 'storage' as SectionId,
        title: 'Storage',
        icon: HardDrive,
        accent: 'from-cyan-500 to-blue-500',
        rows: [],
        custom: 'storage' as const,
      },
      {
        id: 'support' as SectionId,
        title: 'Support',
        icon: HelpCircle,
        accent: 'from-slate-500 to-slate-700',
        rows: [
          {
            label: 'Help & FAQ',
            desc: 'Campus platform guidance',
            keywords: 'help faq',
          },
          {
            label: 'Report a bug / complaint',
            desc: 'Submit a support ticket',
            to: '/home/complaints',
            keywords: 'bug report complaint support ticket',
          },
          {
            label: 'About AVICHIAN',
            desc: 'Private campus platform · Avichi Arts & Science College',
            keywords: 'about version',
          },
          {
            label: 'Privacy policy',
            desc: 'How campus data is used',
            keywords: 'privacy policy',
          },
          {
            label: 'Terms of service',
            desc: 'Campus community rules',
            keywords: 'terms',
          },
        ],
      },
    ];
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((s) => ({
        ...s,
        rows: s.rows.filter(
          (r) =>
            r.label.toLowerCase().includes(q) ||
            (r.desc || '').toLowerCase().includes(q) ||
            (r.keywords || '').toLowerCase().includes(q) ||
            s.title.toLowerCase().includes(q),
        ),
      }))
      .filter((s) => s.rows.length > 0 || s.custom || s.title.toLowerCase().includes(q));
  }, [sections, query]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="h-16 animate-pulse rounded-[24px] bg-slate-100 dark:bg-slate-800" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-40 animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative mx-auto max-w-2xl space-y-4 pb-12"
    >
      <div className="pointer-events-none absolute -right-20 -top-10 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 top-40 h-40 w-40 rounded-full bg-violet-400/10 blur-3xl" />

      <header className="relative flex items-start gap-3">
        <Link
          to="/home/profile"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 text-slate-600 shadow-soft dark:bg-slate-800 dark:text-slate-300"
          aria-label="Back"
        >
          <ArrowLeft size={18} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
          <p className="text-sm text-slate-500">Manage your account and preferences</p>
        </div>
      </header>

      <div className="relative glass-card flex items-center gap-2 rounded-[22px] px-4 py-2.5 shadow-soft">
        <Search size={16} className="text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search settings…"
          className="min-h-9 w-full bg-transparent text-sm outline-none dark:text-white"
        />
        {query ? (
          <button type="button" onClick={() => setQuery('')} className="text-slate-400">
            <X size={16} />
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-2xl bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
      ) : null}

      {data ? (
        <div className="glass-card flex items-center gap-3 rounded-[24px] p-4 shadow-soft dark:bg-slate-900/50">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-primary/10 text-primary">
            {data.account.profilePhotoUrl ? (
              <img
                src={data.account.profilePhotoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <User size={22} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-slate-900 dark:text-white">
              {data.account.name}
            </p>
            <p className="truncate text-xs text-slate-500">
              {data.account.regNo} · {data.account.department}
            </p>
          </div>
          <Link
            to="/home/profile"
            className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
          >
            Profile
          </Link>
        </div>
      ) : null}

      <div className="relative space-y-4">
        {filtered.map((section, i) => {
          const Icon = section.icon;
          return (
            <motion.section
              key={section.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="glass-card overflow-hidden rounded-[28px] shadow-soft dark:bg-slate-900/50"
            >
              <div className="flex items-center gap-3 border-b border-slate-100/80 px-4 py-3 dark:border-slate-800">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${section.accent} text-white shadow-soft`}
                >
                  <Icon size={16} />
                </div>
                <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  {section.title}
                </h2>
              </div>

              {section.custom === 'calls' ? (
                <div className="space-y-1 p-2">
                  <div className="flex items-center gap-3 px-3 py-3.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                      <Volume2 size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Incoming Ringtone
                      </p>
                      <p className="text-xs text-slate-400">
                        Current: {getRingtoneDisplayName()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Enable ringtone
                      </p>
                      <p className="text-xs text-slate-400">Play sound on incoming calls</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={ringtoneOn}
                      onClick={() => {
                        const next = !ringtoneOn;
                        setRingtoneOn(next);
                        setRingtoneEnabled(next);
                      }}
                      className={`relative h-7 w-12 rounded-full transition ${
                        ringtoneOn ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                          ringtoneOn ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-3 px-3 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Vibration
                      </p>
                      <p className="text-xs text-slate-400">Vibrate on mobile devices</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={vibrateOn}
                      onClick={() => {
                        const next = !vibrateOn;
                        setVibrateOn(next);
                        setVibrateEnabled(next);
                      }}
                      className={`relative h-7 w-12 rounded-full transition ${
                        vibrateOn ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${
                          vibrateOn ? 'left-5' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                  <div className="px-3 pb-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        void testIncomingRingtone(2800)
                          .then(() => {
                            setRingtoneTestMsg('Playing…');
                            window.setTimeout(() => setRingtoneTestMsg(''), 3000);
                          })
                          .catch((err) => {
                            setRingtoneTestMsg(
                              err instanceof Error ? err.message : 'Could not play ringtone',
                            );
                          });
                      }}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-primary/10 text-sm font-semibold text-primary"
                    >
                      <Phone size={16} /> Test ringtone
                    </button>
                    {ringtoneTestMsg ? (
                      <p className="mt-2 text-center text-xs text-slate-500">{ringtoneTestMsg}</p>
                    ) : (
                      <p className="mt-2 text-center text-[11px] text-slate-400">
                        Volume follows your device volume
                      </p>
                    )}
                  </div>
                </div>
              ) : null}

              {section.custom === 'appearance' && data ? (
                <div className="grid grid-cols-3 gap-2 p-4">
                  {(
                    [
                      { id: 'light', label: 'Light', icon: Sun },
                      { id: 'dark', label: 'Dark', icon: Moon },
                      { id: 'system', label: 'System', icon: Monitor },
                    ] as const
                  ).map((t) => {
                    const I = t.icon;
                    const active = data.appearance.theme === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => void setTheme(t.id)}
                        className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-xs font-semibold transition ${
                          active
                            ? 'border-primary bg-primary/10 text-primary shadow-soft'
                            : 'border-slate-200 bg-white/60 text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300'
                        }`}
                      >
                        <I size={18} />
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {section.custom === 'storage' && data ? (
                <div className="space-y-3 p-4">
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-slate-500">
                      <span>Used</span>
                      <span>
                        {formatBytes(data.storage.totalBytes)} /{' '}
                        {formatBytes(data.storage.limitBytes)}
                      </span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all"
                        style={{ width: `${data.storage.usedPercent}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                      {data.storage.totalFiles} files · campus media storage
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {(
                      [
                        ['photos', 'Photos'],
                        ['videos', 'Videos'],
                        ['reels', 'Reels'],
                        ['documents', 'Documents'],
                      ] as const
                    ).map(([k, label]) => (
                      <div
                        key={k}
                        className="rounded-2xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60"
                      >
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{label}</p>
                        <p className="text-slate-400">
                          {formatBytes(data.storage.byPurpose[k]?.bytes ?? 0)} ·{' '}
                          {data.storage.byPurpose[k]?.count ?? 0} files
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {section.rows.length > 0 ? (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {section.rows.map((row) => (
                    <li key={row.label}>
                      {row.to ? (
                        <Link
                          to={row.to}
                          className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white">
                              {row.label}
                            </p>
                            {row.desc ? (
                              <p className="truncate text-xs text-slate-400">{row.desc}</p>
                            ) : null}
                          </div>
                          <ChevronRight size={16} className="shrink-0 text-slate-300" />
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm font-semibold ${
                                row.danger ? 'text-error' : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {row.label}
                            </p>
                            {row.desc && !row.select ? (
                              <p className="truncate text-xs text-slate-400">{row.desc}</p>
                            ) : null}
                          </div>
                          {row.toggle !== undefined && row.onToggle ? (
                            <Toggle on={row.toggle} onChange={row.onToggle} />
                          ) : null}
                          {row.select ? (
                            <select
                              value={row.select.value}
                              onChange={(e) => row.select!.onChange(e.target.value)}
                              className="max-w-[42%] rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-medium outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            >
                              {row.select.options.map((o) => (
                                <option key={o.v} value={o.v}>
                                  {o.l}
                                </option>
                              ))}
                            </select>
                          ) : null}
                          {row.onClick && row.toggle === undefined && !row.select ? (
                            <button
                              type="button"
                              onClick={row.onClick}
                              className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                            >
                              Open
                            </button>
                          ) : null}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}

              {section.id === 'security' && data && data.sessions.length > 0 ? (
                <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                  <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                    Devices
                  </p>
                  <div className="space-y-2">
                    {data.sessions.slice(0, 5).map((s) => (
                      <div
                        key={s.id}
                        className="flex items-start gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/50"
                      >
                        <Smartphone size={14} className="mt-0.5 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-700 dark:text-slate-200">
                            {s.deviceLabel || s.userAgent?.slice(0, 48) || 'Device'}
                          </p>
                          <p className="text-slate-400">
                            {s.ipAddress || '—'} · {new Date(s.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </motion.section>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setLogoutOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-[24px] border border-rose-200 bg-rose-50 py-3.5 text-sm font-semibold text-rose-600 shadow-soft dark:border-rose-900 dark:bg-rose-950/40"
      >
        <LogOut size={16} /> Log out
      </button>

      <p className="text-center text-[11px] text-slate-400">
        Signed in as {user?.regNo} · AVICHIAN campus
      </p>

      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2.5 text-sm text-white shadow-float lg:bottom-8"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Logout confirm */}
      <ConfirmModal
        open={logoutOpen}
        title="Log out?"
        body="You will need your password to sign in again."
        confirmLabel="Log out"
        onCancel={() => setLogoutOpen(false)}
        onConfirm={() => void doLogout()}
      />

      <ConfirmModal
        open={logoutAllOpen}
        title="Log out all devices?"
        body="Every active session will be revoked immediately."
        confirmLabel="Log out everywhere"
        danger
        loading={busy}
        onCancel={() => setLogoutAllOpen(false)}
        onConfirm={() => void doLogoutAll()}
      />

      {/* Password sheet */}
      <AnimatePresence>
        {passwordOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={() => setPasswordOpen(false)}
          >
            <motion.form
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handlePassword}
              className="w-full max-w-md space-y-3 rounded-t-[28px] bg-white p-6 shadow-2xl dark:bg-slate-900 sm:rounded-[28px]"
            >
              <div className="flex items-center gap-2">
                <KeyRound size={18} className="text-primary" />
                <h2 className="text-lg font-bold dark:text-white">Change password</h2>
              </div>
              {pwdError ? <p className="text-sm text-error">{pwdError}</p> : null}
              <input
                type="password"
                required
                placeholder="Current password"
                value={pwd.current}
                onChange={(e) => setPwd({ ...pwd, current: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            <div>
              <input
                type="password"
                required
                placeholder="New password"
                value={pwd.next}
                onChange={(e) => setPwd({ ...pwd, next: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <PasswordHint password={pwd.next} />
              {!isValidPasswordDetailed(pwd.next).valid && pwd.next ? (
                <p className="mt-1 text-[11px] text-slate-400">
                  Need 8+ chars with upper, lower, and a number
                </p>
              ) : null}
            </div>
            <input
              type="password"
              required
              placeholder="Confirm new password"
              value={pwd.confirm}
              onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 rounded-full bg-primary py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? 'Saving…' : 'Update password'}
                </button>
                <button
                  type="button"
                  onClick={() => setPasswordOpen(false)}
                  className="rounded-full bg-slate-100 px-5 py-3 text-sm font-semibold dark:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Login history */}
      <AnimatePresence>
        {historyOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 sm:items-center sm:p-6"
            onClick={() => setHistoryOpen(false)}
          >
            <motion.div
              initial={{ y: 30 }}
              animate={{ y: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white p-5 shadow-2xl dark:bg-slate-900 sm:rounded-[28px]"
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History size={18} className="text-primary" />
                  <h2 className="font-bold dark:text-white">Login history</h2>
                </div>
                <button type="button" onClick={() => setHistoryOpen(false)} className="p-2">
                  <X size={18} />
                </button>
              </div>
              {history.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">No login records yet</p>
              ) : (
                <ul className="space-y-2">
                  {history.map((h) => (
                    <li
                      key={h.id}
                      className="rounded-2xl bg-slate-50 px-3 py-2.5 text-xs dark:bg-slate-800/60"
                    >
                      <p className="font-semibold text-slate-800 dark:text-slate-200">
                        {h.success ? 'Success' : 'Failed'} · {h.ipAddress || '—'}
                      </p>
                      <p className="text-slate-400">{new Date(h.createdAt).toLocaleString()}</p>
                    </li>
                  ))}
                </ul>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-8 w-14 shrink-0 rounded-full transition ${on ? 'bg-primary' : 'bg-slate-200 dark:bg-slate-700'}`}
    >
      <motion.span
        layout
        className="absolute top-1 h-6 w-6 rounded-full bg-white shadow"
        animate={{ left: on ? 30 : 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  danger,
  loading,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
          onClick={onCancel}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm space-y-4 rounded-[28px] bg-white p-6 shadow-2xl dark:bg-slate-900"
          >
            <h2 className="text-lg font-bold dark:text-white">{title}</h2>
            <p className="text-sm text-slate-500">{body}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                className={`flex-1 rounded-full py-3 text-sm font-semibold text-white disabled:opacity-50 ${
                  danger ? 'bg-error' : 'bg-primary'
                }`}
              >
                {loading ? 'Please wait…' : confirmLabel}
              </button>
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full bg-slate-100 px-5 py-3 text-sm font-semibold dark:bg-slate-800"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
