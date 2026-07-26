import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Building2,
  Calendar,
  Database,
  FileText,
  GraduationCap,
  HardDrive,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Moon,
  Phone,
  Search,
  Settings,
  Shield,
  Sun,
  Users,
  Video,
  Bell,
  Flag,
  UsersRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/super-admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/super-admin/students', icon: GraduationCap, label: 'Students' },
  { to: '/super-admin/staff', icon: Users, label: 'Staff' },
  { to: '/super-admin/hod', icon: Shield, label: 'HOD' },
  { to: '/super-admin/departments', icon: Building2, label: 'Departments' },
  { to: '/super-admin/posts', icon: FileText, label: 'Posts', phase2: true },
  { to: '/super-admin/communities', icon: UsersRound, label: 'Communities', phase2: true },
  { to: '/super-admin/events', icon: Calendar, label: 'Events', phase2: true },
  { to: '/super-admin/chat', icon: MessageSquare, label: 'Chat Monitoring', phase2: true },
  { to: '/super-admin/calls', icon: Phone, label: 'Calls', phase2: true },
  { to: '/super-admin/reports', icon: Flag, label: 'Reports', phase2: true },
  { to: '/super-admin/storage', icon: HardDrive, label: 'Storage', phase2: true },
  { to: '/super-admin/notifications', icon: Bell, label: 'Notifications', phase2: true },
  { to: '/super-admin/analytics', icon: BarChart3, label: 'Analytics', phase2: true },
  { to: '/super-admin/audit-logs', icon: Activity, label: 'Audit Logs' },
  { to: '/super-admin/settings', icon: Settings, label: 'Settings' },
  { to: '/super-admin/health', icon: Database, label: 'System Health' },
];

export function SuperAdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem('sa-theme') === 'dark');
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('sa-theme', dark ? 'dark' : 'light');
  }, [dark]);

  async function handleLogout() {
    await logout();
    navigate('/super-admin/login');
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.length < 2) return;
    navigate(`/super-admin/search?q=${encodeURIComponent(search)}`);
    setSearchOpen(false);
  }

  const shell = dark
    ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white'
    : 'bg-gradient-to-br from-slate-50 via-white to-blue-50/30 text-slate-900';

  const sidebar = dark
    ? 'bg-slate-900/80 border-slate-700/50 text-slate-200'
    : 'bg-white/70 border-white/40 text-slate-700';

  return (
    <div className={`min-h-dvh ${shell}`}>
      <div className="flex min-h-dvh">
        <aside
          className={`fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r backdrop-blur-xl lg:flex ${sidebar}`}
        >
          <div className="flex items-center gap-3 border-b border-inherit px-5 py-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white">
              <Shield size={20} />
            </div>
            <div>
              <p className="font-bold">Avichian</p>
              <p className="text-xs opacity-60">Super Admin</p>
            </div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-primary text-white shadow-float'
                      : 'hover:bg-primary/10'
                  }`
                }
              >
                <item.icon size={18} />
                {item.label}
                {item.phase2 ? (
                  <span className="ml-auto rounded-full bg-accent/20 px-2 py-0.5 text-[10px] text-accent">
                    Soon
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            onClick={handleLogout}
            className="m-3 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-error hover:bg-error/10"
          >
            <LogOut size={18} />
            Logout
          </button>
        </aside>

        <div className="flex flex-1 flex-col lg:pl-64">
          <header className={`sticky top-0 z-30 border-b backdrop-blur-xl ${sidebar}`}>
            <div className="flex items-center gap-4 px-4 py-4 lg:px-8">
              <button
                type="button"
                className="lg:hidden rounded-xl p-2 hover:bg-primary/10"
                onClick={() => setMobileNav(!mobileNav)}
              >
                <LayoutDashboard size={20} />
              </button>
              <form onSubmit={handleSearch} className="relative flex-1 max-w-xl">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearchOpen(true)}
                  placeholder="Search students, staff, departments…"
                  className={`w-full rounded-[20px] py-3 pl-11 pr-4 text-sm outline-none ${
                    dark ? 'bg-slate-800 text-white' : 'bg-white/80'
                  }`}
                />
              </form>
              <button
                type="button"
                onClick={() => setDark(!dark)}
                className="rounded-xl p-2.5 hover:bg-primary/10"
                aria-label="Toggle theme"
              >
                {dark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <div className="hidden text-right sm:block">
                <p className="text-sm font-semibold">{user?.name}</p>
                <p className="text-xs opacity-60">{user?.email}</p>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 lg:p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      {mobileNav ? (
        <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setMobileNav(false)}>
          <div className={`absolute left-0 top-0 h-full w-72 p-4 ${sidebar}`} onClick={(e) => e.stopPropagation()}>
            <nav className="space-y-1 pt-16">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileNav(false)}
                  className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm"
                >
                  <item.icon size={18} />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      ) : null}
    </div>
  );
}