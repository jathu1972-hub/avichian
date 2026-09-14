import {
  Bell,
  Briefcase,
  CalendarDays,
  Clapperboard,
  Home,
  LogOut,
  Menu,
  MessageCircle,
  PartyPopper,
  Plus,
  Search,
  Settings,
  Users,
  UsersRound,
  X,
  Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { isStaffRole } from '../lib/portal';
import { fetchNotifications } from '../lib/social';
import { connectSocket } from '../lib/socket';
import { StudentAvatar } from '../components/student/StudentAvatar';
import { IncomingCallBanner } from '../components/student/IncomingCallBanner';
import { ThemeDecoration } from '../components/ThemeDecoration';

const mobileNav = [
  { to: '/home', icon: Home, label: 'Home', end: true },
  { to: '/home/search', icon: Search, label: 'Search' },
  { to: '/home/create', icon: Plus, label: 'Create', center: true },
  { to: '/home/chat', icon: MessageCircle, label: 'Chat' },
  { to: '/home/profile', icon: 'avatar' as const, label: 'Profile' },
];

const desktopNav = [
  { to: '/home', icon: Home, label: 'Home', end: true },
  { to: '/home/search', icon: Search, label: 'Search' },
  { to: '/home/reels', icon: Clapperboard, label: 'Reels' },
  { to: '/home/friends', icon: Users, label: 'Friends' },
  { to: '/home/skill-match', icon: Zap, label: 'Skill Match' },
  { to: '/home/chat', icon: MessageCircle, label: 'Chat' },
  { to: '/home/events', icon: PartyPopper, label: 'Events' },
  { to: '/home/calendar', icon: CalendarDays, label: 'Calendar' },
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
          `group flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold tracking-tight transition-all ${
            isActive
              ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-float'
              : 'text-slate-600 hover:bg-primary/8 hover:text-primary dark:text-zinc-300 dark:hover:bg-white/5'
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
        `flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold tracking-tight transition-all ${
          isActive
            ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-float'
            : 'text-slate-600 hover:bg-primary/8 hover:text-primary dark:text-zinc-300 dark:hover:bg-white/5'
        } ${collapsed ? 'justify-center' : ''}`
      }
    >
      <Icon size={20} className="shrink-0 opacity-90" strokeWidth={1.9} />
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
  const [notifUnread, setNotifUnread] = useState(0);

  useEffect(() => {
    setDrawerOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function refreshUnread() {
      fetchNotifications()
        .then((d) => setNotifUnread(d.unread ?? 0))
        .catch(() => undefined);
    }
    refreshUnread();
    const socket = connectSocket();
    function onNew() {
      refreshUnread();
    }
    function onDeleted() {
      refreshUnread();
    }
    socket.on('notification', onNew);
    socket.on('notification:new', onNew);
    socket.on('notification:read', onNew);
    socket.on('notification:deleted', onDeleted);
    socket.on('friend:accept', refreshUnread);
    socket.on('skill-match:request', refreshUnread);
    socket.on('skill-match:accept', refreshUnread);
    return () => {
      socket.off('notification', onNew);
      socket.off('notification:new', onNew);
      socket.off('notification:read', onNew);
      socket.off('notification:deleted', onDeleted);
      socket.off('friend:accept', refreshUnread);
      socket.off('skill-match:request', refreshUnread);
      socket.off('skill-match:accept', refreshUnread);
    };
  }, []);

  useBodyScrollLock(drawerOpen);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <ThemeDecoration />
      <IncomingCallBanner />
      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/50 bg-white/70 pt-safe backdrop-blur-2xl dark:border-zinc-800 dark:bg-zinc-950/80 lg:flex"
        style={{ paddingLeft: 'max(0px, env(safe-area-inset-left))' }}
        aria-label="Main navigation"
      >
        <div className="flex items-center gap-3 border-b border-slate-100/80 px-5 py-5 dark:border-zinc-800">
          <div className="brand-mark flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold tracking-tight text-white">
            A
          </div>
          <div className="min-w-0">
            <p className="font-display truncate text-base font-extrabold tracking-tight text-slate-900 dark:text-white">
              AVICHIAN
            </p>
            <p className="truncate text-[11px] font-medium text-slate-500 dark:text-zinc-400">
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
                `flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold ${
                  isActive
                    ? 'bg-gradient-to-r from-primary to-secondary text-white'
                    : 'text-slate-600 hover:bg-primary/8'
                }`
              }
            >
              <Briefcase size={20} />
              Staff tools
            </NavLink>
          ) : null}
        </nav>
        <div className="border-t border-slate-100/80 p-3 dark:border-zinc-800">
          <div className="mb-2 flex items-center gap-3 rounded-2xl px-2 py-2">
            <StudentAvatar name={user?.name ?? 'Me'} photoUrl={user?.profilePhotoUrl} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{user?.name}</p>
              <p className="truncate text-[11px] text-slate-500">{user?.regNo}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-error hover:bg-error/10"
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
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[min(18.5rem,90vw)] flex-col bg-white/95 shadow-float backdrop-blur-2xl dark:bg-zinc-950 pt-safe">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="brand-mark flex h-9 w-9 items-center justify-center rounded-xl text-xs font-bold text-white">
                  A
                </div>
                <p className="font-display font-extrabold text-slate-900 dark:text-white">Menu</p>
              </div>
              <button
                type="button"
                className="touch-target flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-zinc-800"
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

      <div className="app-shell-main-col lg:pl-64">
        <header className="sticky top-0 z-20 glass-nav border-b border-white/40 pt-safe dark:border-zinc-800/80">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-safe py-2.5 sm:gap-3 sm:py-3">
            <button
              type="button"
              className="touch-target flex items-center justify-center rounded-2xl text-slate-600 hover:bg-primary/10 lg:hidden dark:text-zinc-300"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <div className="brand-mark flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-sm font-extrabold text-white lg:hidden">
                A
              </div>
              <div className="min-w-0 lg:hidden">
                <p className="truncate font-display text-sm font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-base">
                  AVICHIAN
                </p>
                <p className="truncate text-[10px] font-medium text-slate-500 sm:text-[11px]">
                  {user?.department ?? 'Campus'}
                </p>
              </div>

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
                <Search
                  className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  name="q"
                  placeholder="Search students, communities…"
                  className="min-h-11 w-full rounded-full border border-slate-200/80 bg-white/90 py-2.5 pl-11 pr-4 text-sm font-medium text-slate-900 shadow-soft outline-none transition placeholder:text-slate-500 focus:border-primary focus:ring-4 focus:ring-primary/12 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-50 dark:placeholder:text-zinc-400"
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
                to="/home/communities"
                className="touch-target hidden items-center justify-center rounded-full text-slate-500 hover:bg-primary/10 hover:text-primary sm:flex"
                aria-label="Communities"
              >
                <UsersRound size={20} />
              </NavLink>
              <NavLink
                to="/home/notifications"
                className="touch-target relative flex items-center justify-center rounded-full text-slate-500 hover:bg-primary/10 hover:text-primary dark:text-zinc-300"
                aria-label="Notifications"
              >
                <Bell size={20} />
                {notifUnread > 0 ? (
                  <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white shadow-soft">
                    {notifUnread > 9 ? '9+' : notifUnread}
                  </span>
                ) : null}
              </NavLink>
              <NavLink
                to="/home/profile"
                className="touch-target hidden items-center justify-center rounded-full ring-2 ring-primary/15 sm:flex"
                aria-label="Profile"
              >
                <StudentAvatar name={user?.name ?? 'Me'} photoUrl={user?.profilePhotoUrl} size="sm" />
              </NavLink>
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="touch-target flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-primary dark:hover:bg-zinc-800"
                aria-label="Sign out"
              >
                <LogOut size={18} />
              </button>
            </div>
          </div>

          {searchOpen ? (
            <form
              className="border-t border-slate-100/80 px-safe py-2 md:hidden dark:border-zinc-800"
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
                className="min-h-11 w-full rounded-full border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 outline-none placeholder:text-slate-500 focus:border-primary focus:ring-4 focus:ring-primary/12 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-400"
              />
            </form>
          ) : null}
        </header>

        <main className="main-with-bottom-nav mx-auto w-full max-w-6xl px-safe py-3 sm:py-4 lg:py-6">
          <Outlet />
        </main>

        {/* Floating glass bottom navigation */}
        <nav className="bottom-nav fixed bottom-0 left-0 right-0 z-30 lg:hidden" aria-label="Bottom navigation">
          <div className="bottom-nav-inner glass-nav flex items-end justify-between gap-0.5 px-1.5 py-1.5 shadow-float">
            {mobileNav.map((item) => {
              if (item.icon === 'avatar') {
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1 text-[10px] font-semibold transition sm:text-[11px] ${
                        isActive ? 'text-primary' : 'text-slate-500 dark:text-zinc-400'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span
                          className={`rounded-full p-0.5 ${isActive ? 'ring-2 ring-primary/40' : ''}`}
                        >
                          <StudentAvatar
                            name={user?.name ?? 'Me'}
                            photoUrl={user?.profilePhotoUrl}
                            size="sm"
                          />
                        </span>
                        <span className="truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                );
              }
              const Icon = item.icon;
              if (item.center) {
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className="nav-fab relative -mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white transition active:scale-95"
                    aria-label={item.label}
                  >
                    <Icon size={24} strokeWidth={2.25} />
                  </NavLink>
                );
              }
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-1 text-[10px] font-semibold transition sm:text-[11px] ${
                      isActive ? 'text-primary' : 'text-slate-500 hover:text-primary dark:text-zinc-400'
                    }`
                  }
                  aria-label={item.label}
                >
                  {({ isActive }) => (
                    <>
                      <span
                        className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                          isActive ? 'bg-primary/12 text-primary' : ''
                        }`}
                      >
                        <Icon size={20} strokeWidth={isActive ? 2.25 : 1.9} />
                      </span>
                      <span className="truncate">{item.label}</span>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
