import {
  Activity,
  BarChart3,
  Building2,
  Calendar,
  Clapperboard,
  ChevronLeft,
  ChevronRight,
  Database,
  FileText,
  Flag,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Search,
  Settings,
  Shield,
  Sun,
  Users,
  UsersRound,
  X,
  Bell,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/students', icon: GraduationCap, label: 'Students' },
  { to: '/staff', icon: Users, label: 'Staff' },
  { to: '/departments', icon: Building2, label: 'Departments' },
  { to: '/posts', icon: FileText, label: 'Posts' },
  { to: '/reels', icon: Clapperboard, label: 'Reels' },
  { to: '/announcements', icon: Bell, label: 'Announcements' },
  { to: '/events', icon: Calendar, label: 'Events' },
  { to: '/communities', icon: UsersRound, label: 'Communities' },
  { to: '/reports', icon: Flag, label: 'Reports' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/audit-logs', icon: Activity, label: 'Audit Logs' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/health', icon: Database, label: 'System Health' },
];

export function SuperAdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem('sa-theme') === 'dark');
  const [search, setSearch] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sa-sidebar') === 'collapsed');
  const [mobileSearch, setMobileSearch] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('sa-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    localStorage.setItem('sa-sidebar', collapsed ? 'collapsed' : 'expanded');
  }, [collapsed]);

  useEffect(() => {
    setMobileNav(false);
    setMobileSearch(false);
  }, [location.pathname]);

  useBodyScrollLock(mobileNav);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim().length < 1) return;
    navigate(`/students?q=${encodeURIComponent(search.trim())}`);
    setMobileSearch(false);
  }

  const shell = dark
    ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white'
    : 'bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-slate-900';

  const sidebar = dark
    ? 'bg-slate-900/90 border-slate-700/50 text-slate-200'
    : 'bg-white/80 border-white/40 text-slate-700';

  const sidebarWidth = collapsed ? 'lg:w-[4.5rem]' : 'lg:w-64';
  const mainPad = collapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-64';

  function renderNav(onNavigate?: () => void, compact?: boolean) {
    return navItems.map((item) => (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={onNavigate}
        title={item.label}
        className={({ isActive }) =>
          `flex min-h-11 items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition ${
            isActive ? 'bg-primary text-white shadow-float' : 'hover:bg-primary/10'
          } ${compact ? 'justify-center px-2' : ''}`
        }
      >
        <item.icon size={18} className="shrink-0" />
        {!compact ? <span className="truncate">{item.label}</span> : <span className="sr-only">{item.label}</span>}
      </NavLink>
    ));
  }

  return (
    <div className={`admin-shell ${shell}`}>
      <div className="flex w-full min-h-dvh flex-1 flex-col lg:flex-row">
        {/* Desktop sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-40 hidden flex-col border-r backdrop-blur-xl transition-[width] duration-200 lg:flex ${sidebarWidth} ${sidebar}`}
        >
          <div className={`flex items-center gap-3 border-b border-inherit py-5 ${collapsed ? 'justify-center px-2' : 'px-5'}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
              <Shield size={20} />
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <p className="truncate font-bold">Avichian</p>
                <p className="truncate text-xs opacity-60">Super Admin</p>
              </div>
            ) : null}
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-2 sm:p-3">{renderNav(undefined, collapsed)}</nav>
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="m-2 flex min-h-11 items-center justify-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium opacity-70 hover:bg-primary/10"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /> Collapse</>}
          </button>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className={`m-2 flex min-h-11 items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-error hover:bg-error/10 ${collapsed ? 'justify-center' : ''}`}
          >
            <LogOut size={18} />
            {!collapsed ? 'Logout' : <span className="sr-only">Logout</span>}
          </button>
        </aside>

        <div className={`flex min-w-0 flex-1 flex-col overflow-visible ${mainPad}`}>
          <header className={`sticky top-0 z-30 border-b backdrop-blur-xl pt-safe ${sidebar}`}>
            <div className="flex items-center gap-2 px-3 py-3 sm:gap-4 sm:px-4 lg:px-8">
              <button
                type="button"
                className="touch-target flex items-center justify-center rounded-xl hover:bg-primary/10 lg:hidden"
                onClick={() => setMobileNav(true)}
                aria-label="Open navigation"
              >
                <Menu size={22} />
              </button>

              <form onSubmit={handleSearch} className="relative hidden min-w-0 flex-1 max-w-xl sm:block">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 sm:left-4" size={18} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search students, staff…"
                  className={`min-h-11 w-full rounded-[20px] py-2.5 pl-10 pr-4 text-sm outline-none sm:pl-11 ${
                    dark ? 'bg-slate-800 text-white' : 'bg-white/90'
                  }`}
                />
              </form>

              <button
                type="button"
                className="touch-target flex items-center justify-center rounded-xl hover:bg-primary/10 sm:hidden"
                onClick={() => setMobileSearch((v) => !v)}
                aria-label="Search"
              >
                <Search size={20} />
              </button>

              <div className="ml-auto flex items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setDark(!dark)}
                  className="touch-target flex items-center justify-center rounded-xl hover:bg-primary/10"
                  aria-label="Toggle theme"
                >
                  {dark ? <Sun size={20} /> : <Moon size={20} />}
                </button>
                <div className="hidden min-w-0 text-right md:block">
                  <p className="truncate text-sm font-semibold">{user?.name}</p>
                  <p className="truncate text-xs opacity-60">{user?.email}</p>
                </div>
              </div>
            </div>
            {mobileSearch ? (
              <form onSubmit={handleSearch} className="border-t border-inherit px-3 py-2 sm:hidden">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                  placeholder="Search…"
                  className={`min-h-11 w-full rounded-[20px] px-4 text-sm outline-none ${
                    dark ? 'bg-slate-800 text-white' : 'bg-white'
                  }`}
                />
              </form>
            ) : null}
          </header>

          <main className="admin-main p-3 sm:p-4 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileNav ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close navigation"
            onClick={() => setMobileNav(false)}
          />
          <div
            className={`absolute inset-y-0 left-0 flex w-[min(18rem,90vw)] flex-col border-r p-3 shadow-float ${sidebar}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between px-2 pt-2">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-white">
                  <Shield size={18} />
                </div>
                <p className="font-bold">Super Admin</p>
              </div>
              <button
                type="button"
                className="touch-target flex items-center justify-center rounded-xl hover:bg-primary/10"
                onClick={() => setMobileNav(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <nav className="flex-1 space-y-1 overflow-y-auto">{renderNav(() => setMobileNav(false))}</nav>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="mt-2 flex min-h-11 items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-error hover:bg-error/10"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
