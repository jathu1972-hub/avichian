import { GraduationCap, LayoutDashboard, LogOut, Upload } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/staff', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/staff/students', icon: GraduationCap, label: 'Students' },
  { to: '/staff/import', icon: Upload, label: 'Import CSV' },
];

export function StaffLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-slate-200/80 bg-white/80 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-primary">Staff Console</p>
            <p className="font-semibold">{user?.name ?? user?.regNo}</p>
          </div>
          <button type="button" onClick={handleLogout} className="flex items-center gap-2 text-sm text-slate-500 hover:text-primary">
            <LogOut size={16} /> Logout
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[220px_1fr]">
        <nav className="space-y-1">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-[20px] px-4 py-3 text-sm font-medium ${
                  isActive ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}