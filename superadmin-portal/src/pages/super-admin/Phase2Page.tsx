import { useLocation } from 'react-router-dom';
import { Calendar, FileText, Flag, HardDrive, MessageSquare, Phone, BarChart3, Bell, UsersRound } from 'lucide-react';
import { EmptyState } from '../../components/admin/EmptyState';

const titles: Record<string, { title: string; icon: typeof FileText }> = {
  posts: { title: 'Posts Management', icon: FileText },
  communities: { title: 'Community Management', icon: UsersRound },
  events: { title: 'Event Management', icon: Calendar },
  chat: { title: 'Chat Monitoring', icon: MessageSquare },
  calls: { title: 'Call Monitoring', icon: Phone },
  reports: { title: 'Reports', icon: Flag },
  storage: { title: 'Storage Management', icon: HardDrive },
  notifications: { title: 'Notification Center', icon: Bell },
  analytics: { title: 'Analytics', icon: BarChart3 },
};

export function Phase2Page() {
  const { pathname } = useLocation();
  const key = pathname.split('/').pop() ?? 'posts';
  const meta = titles[key] ?? { title: 'Coming Soon', icon: FileText };

  return (
    <EmptyState
      icon={meta.icon}
      title={meta.title}
      description="This module activates in Phase 2+. The dashboard will show real data only — no fake counts or demo content."
    />
  );
}