import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';

export function SettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [dark, setDark] = useState(() => localStorage.getItem('student-theme') === 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('student-theme', dark ? 'dark' : 'light');
  }, [dark]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  const sections = [
    {
      title: 'Account',
      items: [
        { label: 'Name', value: user?.name ?? '—' },
        { label: 'Reg No', value: user?.regNo ?? '—' },
        { label: 'Email', value: user?.email ?? '—' },
        { label: 'Department', value: user?.department ?? '—' },
      ],
    },
    {
      title: 'Privacy',
      items: [
        { label: 'Profile visibility', value: 'Friends / Public (profile settings)' },
        { label: 'Blocked users', value: 'Coming soon' },
      ],
    },
    {
      title: 'Notifications',
      items: [
        { label: 'Friend requests', value: 'On' },
        { label: 'Events & announcements', value: 'On' },
        { label: 'Push (FCM / APNs)', value: 'Configure in Capacitor build' },
      ],
    },
    {
      title: 'Security',
      items: [
        { label: 'Password', value: 'Change via forgot password' },
        { label: 'Sessions', value: 'Managed by JWT + refresh cookie' },
      ],
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Settings</h1>
        <p className="text-sm text-slate-500">Account, privacy, storage, security</p>
      </div>

      <div className="glass-card flex items-center justify-between rounded-[24px] p-4 shadow-soft">
        <div>
          <p className="font-semibold">Appearance</p>
          <p className="text-xs text-slate-500">Dark / light mode</p>
        </div>
        <button
          type="button"
          onClick={() => setDark((v) => !v)}
          className={`relative h-8 w-14 rounded-full transition ${dark ? 'bg-primary' : 'bg-slate-200'}`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition ${
              dark ? 'left-7' : 'left-1'
            }`}
          />
        </button>
      </div>

      {sections.map((s) => (
        <div key={s.title} className="glass-card rounded-[24px] p-5 shadow-soft">
          <h2 className="font-semibold text-slate-900">{s.title}</h2>
          <ul className="mt-3 space-y-2">
            {s.items.map((item) => (
              <li
                key={item.label}
                className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50"
              >
                <span className="text-slate-500">{item.label}</span>
                <span className="max-w-[55%] truncate text-right font-medium text-slate-800 dark:text-slate-200">
                  {item.value}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="glass-card rounded-[24px] p-5 text-sm text-slate-500 shadow-soft">
        <p className="font-medium text-slate-800">Storage & media</p>
        <p className="mt-1 text-xs">
          Photos and videos upload through the Avichian API. This app is for students only and
          uses the shared campus backend for your roster, feed, and events.
        </p>
      </div>

      <Button type="button" variant="secondary" onClick={handleLogout}>
        Logout
      </Button>
    </div>
  );
}
