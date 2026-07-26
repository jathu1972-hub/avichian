import {
  Bell,
  Briefcase,
  Clapperboard,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isStaffRole } from '../lib/portal';
import { StudentAvatar } from '../components/student/StudentAvatar';

const mobileNav = [
  { to: '/home', icon: Home, label: 'Home', end: true },
  { to: '/home/search', icon: Search, label: 'Search' },
  { to: '/home/create', icon: Plus, label: 'Upload', center: true },
  { to: '/home/chat', icon: MessageCircle, label: 'Chat' },
  { to: '/home/profile', icon: 'avatar' as const, label: 'Profile' },
];

const desktopNav = [
  { to: '/home', icon: Home, label: 'Home', end: true },
  { to: '/home/search', icon: Search, label: 'Search' },
  { to: '/home/reels', icon: Clapperboard, label: 'Reels' },
  { to: '/home/friends', icon: Users, label: 'Friends' },
  { to: '/home/chat', icon: MessageCircle, label: 'Chat' },
  { to: '/home/communities', icon: UsersRound, label: 'Communities' },
  { to: '/home/create', icon: Plus, label: 'Create' },
  { to: '/home/notifications', icon: Bell, label: 'Notifications' },
  { to: '/home/profile', icon: 'avatar' as const, label: 'Profile' },
  { to: '/home/settings', icon: Settings, label: 'Settings' },
];

function NavItem({
  item,
  collapsed,
  onNavigate,
  userName,
  userPhoto,
}: {
  item: (typeof desktopNav)[number];
  collapsed?: boolean;
  onNavigate?: () => void;
  userName?: string;
  userPhoto?: string | null;
}) {
  if (item.icon === 'avatar') {
    return (
      <NavLink
        to={item.to}
        onClick={onNavigate}
        className={({ isActive }) =>
          `flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
            isActive ? 'bg-primary text-white shadow-float' : 'text-slate-600 hover:bg-primary/10 hover:text-primary dark:text-slate-300'
          } ${collapsed ? 'justify-center' : ''}`
        }
      >
        <StudentAvatar name={userName ?? 'Me'} photoUrl={userPhoto} size="sm" />
        {!collapsed ? <span>{item.label}</span> : <span className="sr-only">{item.label}</span>}
      </NavLink>
    );
  }

  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
          isActive ? 'bg-primary text-white shadow-float' : 'text-slate-600 hover:bg-primary/10 hover:text-primary dark:text-slate-300'
        } ${collapsed ? 'justify-center' : ''}`
      }
    >
      <Icon size={20} className="shrink-0" />
      {!collapsed ? <span className="truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
    </NavLink>
  );
}

export function StudentLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    setDrawerOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-slate-50 via-white to-primary/5 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Desktop / tablet sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/40 bg-white/80 pt-safe backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 lg:flex"
        style={{ paddingLeft: 'max(0px, env(safe-area-inset-left))' }}
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5 dark:border-slate-800">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-sm font-bold text-white shadow-float">
            A
          </div>
          <div className="min-w-0">
            <p className="font-display truncate text-base font-bold text-slate-900 dark:text-white">AVICHIAN</p>
            <p className="truncate text-[11px] text-slate-500">
              {user?.department ?? 'Campus'}
              {isStaffRole(user?.role) ? ' · Staff' : ''}
            </p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3 scroll-y">
          {desktopNav.map((item) => (
            <NavItem
              key={item.to}
              item={item}
              userName={user?.name}
              userPhoto={user?.profilePhotoUrl}
            />
          ))}
          {isStaffRole(user?.role) ? (
            <NavLink
              to="/home/staff-tools"
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium ${
                  isActive ? 'bg-primary text-white' : 'text-slate-600 hover:bg-primary/10'
                }`
              }
            >
              <Briefcase size={20} />
              Staff tools
            </NavLink>
          ) : null}
        </nav>
        <div className="border-t border-slate-100 p-3 dark:border-slate-800">
          <div className="mb-2 flex items-center gap-3 rounded-2xl px-2 py-2">
            <StudentAvatar name={user?.name ?? 'Me'} photoUrl={user?.profilePhotoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user?.name}</p>
              <p className="truncate text-[11px] text-slate-500">{user?.regNo}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-error hover:bg-error/10"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18rem,88vw)] flex-col bg-white shadow-float dark:bg-slate-900 pt-safe">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 dark:border-slate-800">
              <p className="font-display font-bold text-slate-900 dark:text-white">Menu</p>
              <button
                type="button"
                className="touch-target flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto p-3">
              {desktopNav.map((item) => (
                <NavItem
                  key={item.to}
                  item={item}
                  userName={user?.name}
                  userPhoto={user?.profilePhotoUrl}
                  onNavigate={() => setDrawerOpen(false)}
                />
              ))}
            </nav>
          </aside>
        </div>
      ) : null}

      {/* Main column */}
      <div className="flex min-h-dvh flex-col lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-white/40 bg-white/80 pt-safe backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/85">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-safe py-2.5 sm:gap-3 sm:py-3">
            <button
              type="button"
              className="touch-target flex items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-secondary text-sm font-bold text-white shadow-float lg:hidden">
                A
              </div>
              <div className="min-w-0 lg:hidden">
                <p className="truncate font-display text-sm font-bold text-slate-900 dark:text-white sm:text-base">
                  AVICHIAN
                </p>
                <p className="truncate text-[10px] text-slate-500 sm:text-[11px]">
                  {user?.department ?? 'Campus'}
                </p>
              </div>

              {/* Desktop search */}
              <form
                className="relative ml-auto hidden w-full max-w-md flex-1 md:block lg:ml-0"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = new FormData(e.currentTarget).get('q');
                  if (typeof q === 'string' && q.trim()) {
                    navigate(`/home/search?q=${encodeURIComponent(q.trim())}`);
                  } else {
                    navigate('/home/search');
                  }
                }}
              >
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  name="q"
                  placeholder="Search students…"
                  className="min-h-11 w-full rounded-full border border-slate-200 bg-white/90 py-2 pl-10 pr-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800"
                />
              </form>
            </div>

            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              <button
                type="button"
                className="touch-target flex items-center justify-center rounded-full text-slate-500 hover:bg-primary/10 hover:text-primary md:hidden"
                aria-label="Search"
                onClick={() => setSearchOpen((v) => !v)}
              >
                <Search size={20} />
              </button>
              {isStaffRole(user?.role) ? (
                <NavLink
                  to="/home/staff-tools"
                  className="touch-target flex items-center justify-center rounded-full text-slate-500 hover:bg-primary/10 hover:text-primary"
                  aria-label="Staff tools"
                >
                  <Briefcase size={20} />
                </NavLink>
              ) : null}
              <NavLink
                to="/home/notifications"
                className="touch-target flex items-center justify-center rounded-full text-slate-500 hover:bg-primary/10 hover:text-primary dark:text-slate-300"
                aria-label="Notifications"
              >
                <Bell size={20} />
              </NavLink>
              <NavLink
                to="/home/profile"
                className="touch-target hidden items-center justify-center rounded-full sm:flex"
                aria-label="Profile"
              >
                <StudentAvatar name={user?.name ?? 'Me'} photoUrl={user?.profilePhotoUrl} size="sm" />
              </NavLink>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="touch-target flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-primary dark:hover:bg-slate-800"
                aria-label="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>

          {searchOpen ? (
            <form
              className="border-t border-slate-100 px-safe py-2 md:hidden dark:border-slate-800"
              onSubmit={(e) => {
                e.preventDefault();
                const q = new FormData(e.currentTarget).get('q');
                if (typeof q === 'string') {
                  navigate(`/home/search?q=${encodeURIComponent(q.trim())}`);
                  setSearchOpen(false);
                }
              }}
            >
              <input
                name="q"
                autoFocus
                placeholder="Search students…"
                className="min-h-11 w-full rounded-full border border-slate-200 bg-white px-4 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-slate-700 dark:bg-slate-800"
              />
            </form>
          ) : null}
        </header>

        <main className="main-with-bottom-nav mx-auto w-full max-w-6xl flex-1 min-w-0 px-safe py-3 sm:py-4 lg:py-6">
          <Outlet />
        </main>

        {/* Mobile bottom navigation */}
        <nav
          className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/50 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 lg:hidden pb-safe"
          aria-label="Bottom navigation"
        >
          <div className="mx-auto flex max-w-lg items-end justify-between px-1 py-1.5">
            {mobileNav.map((item) => {
              if (item.icon === 'avatar') {
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1 text-[10px] font-medium sm:text-[11px] ${
                        isActive ? 'text-primary' : 'text-slate-500 dark:text-slate-400'
                      }`
                    }
                  >
                    <StudentAvatar name={user?.name ?? 'Me'} photoUrl={user?.profilePhotoUrl} size="sm" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                );
              }
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1 text-[10px] font-medium transition sm:text-[11px] ${
                      item.center
                        ? '-mt-4 rounded-full bg-primary p-3.5 text-white shadow-float hover:bg-primary/90'
                        : isActive
                          ? 'text-primary'
                          : 'text-slate-500 hover:text-primary dark:text-slate-400'
                    }`
                  }
                  aria-label={item.label}
                >
                  <Icon size={item.center ? 22 : 20} />
                  {!item.center ? <span className="truncate">{item.label}</span> : null}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
