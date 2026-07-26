import { Bell, Calendar, Heart, Megaphone, MessageCircle, Phone, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchNotifications, markNotificationsRead } from '../../lib/social';
import { api } from '../../lib/api';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
}

const icons: Record<string, typeof Bell> = {
  FRIEND_REQUEST: UserPlus,
  FRIEND_ACCEPTED: UserPlus,
  POST_LIKE: Heart,
  COMMENT: MessageCircle,
  CALL_MISSED: Phone,
  CALL_INCOMING: Phone,
  EVENT: Calendar,
  ANNOUNCEMENT: Megaphone,
  MESSAGE: MessageCircle,
  EVENT_REMINDER: Calendar,
};

export function NotificationsPage() {
  const [items, setItems] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchNotifications().catch(() => ({ items: [] as Notif[], unread: 0 })),
      api<{ items: Notif[] }>('/student/notifications').catch(() => ({ data: { items: [] } })),
    ])
      .then(([social, campus]) => {
        const campusItems = (campus.data?.items ?? []).map((n) => ({
          ...n,
          readAt: null as string | null,
        }));
        const merged = [...social.items, ...campusItems].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        setItems(merged);
        return markNotificationsRead().catch(() => undefined);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold">Notifications</h1>
        <p className="text-sm text-slate-500">Friends, likes, calls, events, messages</p>
      </div>

      {loading ? (
        <div className="h-28 animate-pulse rounded-[24px] bg-slate-100" />
      ) : items.length === 0 ? (
        <div className="glass-card rounded-[28px] p-8 text-center text-slate-400 shadow-soft">
          You&apos;re all caught up
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const Icon = icons[n.type] ?? Bell;
            return (
              <div key={n.id} className="glass-card flex gap-3 rounded-[22px] p-4 shadow-soft">
                <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{n.title}</p>
                  <p className="text-sm text-slate-500">{n.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Link to="/home/friends" className="block text-center text-sm font-medium text-primary">
        Manage friend requests →
      </Link>
    </div>
  );
}
