import { Home, LogOut, Plus, Search, User, Users } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { StudentAvatar } from '../components/student/StudentAvatar';

const navItems = [
  { to: '/home', icon: Home, label: 'Feed', end: true },
  { to: '/home/search', icon: Search, label: 'Search' },
  { to: '/home/create', icon: Plus, label: 'Create', center: true },
  { to: '/home/friends', icon: Users, label: 'Friends' },
  { to: '/home/profile', icon: User, label: 'Profile' },
];

export function StudentLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-background to-secondary/10 pb-24">
      <header className="sticky top-0 z-20 border-b border-white/40 bg-white/70 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <StudentAvatar name={user?.name ?? 'Student'} photoUrl={user?.profilePhotoUrl} size="sm" />
            <div>
              <p className="text-xs uppercase tracking-wide text-primary">Avichian</p>
              <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-primary"
            aria-label="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-4">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/50 bg-white/80 px-2 py-2 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg items-end justify-between">
          {navItems.map(({ to, icon: Icon, label, end, center }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition ${
                  center
                    ? isActive
                      ? '-mt-5 rounded-full bg-primary p-3 text-white shadow-float'
                      : '-mt-5 rounded-full bg-primary p-3 text-white shadow-float hover:bg-primary/90'
                    : isActive
                      ? 'text-primary'
                      : 'text-slate-500 hover:text-primary'
                }`
              }
            >
              <Icon size={center ? 22 : 20} />
              {!center ? <span>{label}</span> : null}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}