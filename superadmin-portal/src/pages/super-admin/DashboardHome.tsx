import {
  AlertTriangle,
  Building2,
  Calendar,
  FileText,
  GraduationCap,
  HardDrive,
  MessageSquare,
  Phone,
  Users,
  Video,
  Wifi,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { StatCard } from '../../components/admin/StatCard';
import { api } from '../../lib/api';

interface DashboardStats {
  totalStudents: number;
  totalStaff: number;
  departments: number;
  totalPosts: number;
  messagesToday: number;
  callsToday: number;
  videoCalls: number;
  events: number;
  activeUsers: number;
  onlineUsers: number;
  storageUsedLabel: string;
  reports: number;
  blockedUsers: number;
  masterRoster: number;
  loginsToday: number;
  trends: { students: number };
}

export function DashboardHome() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<DashboardStats>('/super-admin/dashboard/stats')
      .then((res) => setStats(res.data ?? null))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-[28px] bg-slate-200/50" />
        ))}
      </div>
    );
  }

  if (!stats) return <p>Failed to load dashboard.</p>;

  const cards = [
    { icon: GraduationCap, label: 'Registered Students', value: stats.totalStudents, trend: stats.trends?.students },
    { icon: Users, label: 'Master Roster', value: stats.masterRoster },
    { icon: Users, label: 'Staff', value: stats.totalStaff },
    { icon: Building2, label: 'Departments', value: stats.departments },
    { icon: FileText, label: 'Posts', value: stats.totalPosts },
    { icon: MessageSquare, label: 'Messages Today', value: stats.messagesToday },
    { icon: Phone, label: 'Calls Today', value: stats.callsToday },
    { icon: Video, label: 'Video Calls', value: stats.videoCalls },
    { icon: Calendar, label: 'Events', value: stats.events },
    { icon: Wifi, label: 'Active Users (7d)', value: stats.activeUsers },
    { icon: Wifi, label: 'Online Now', value: stats.onlineUsers, accent: 'text-success' },
    { icon: HardDrive, label: 'Storage Used', value: stats.storageUsedLabel },
    { icon: AlertTriangle, label: 'Reports', value: stats.reports },
    { icon: AlertTriangle, label: 'Blocked Users', value: stats.blockedUsers },
  ];

  return (
    <div className="w-full min-w-0 space-y-6 sm:space-y-8">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl lg:text-3xl">Dashboard</h1>
        <p className="mt-1 text-sm opacity-60">
          Live statistics · {stats.loginsToday} logins today
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
        {cards.map((c) => (
          <StatCard key={c.label} {...c} />
        ))}
      </div>
      <p className="text-xs opacity-50">
        Two-app architecture: AVICHIAN app (students + staff) and this Super Admin dashboard only.
      </p>
    </div>
  );
}