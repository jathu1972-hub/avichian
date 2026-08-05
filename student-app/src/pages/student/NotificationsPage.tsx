import {
  Bell,
  Calendar,
  Check,
  CheckCheck,
  Heart,
  Megaphone,
  MessageCircle,
  Phone,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import {
  acceptFriendByUserId,
  acceptFriendRequest,
  deleteNotification,
  fetchNotifications,
  markNotificationsRead,
  rejectFriendRequest,
} from '../../lib/social';
import { connectSocket } from '../../lib/socket';
import { api } from '../../lib/api';

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  isRead?: boolean;
  data?: {
    requestId?: string;
    userId?: string;
    senderName?: string;
    callId?: string;
  } | null;
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

type Filter = 'all' | 'unread' | 'read';

function dayBucket(iso: string): 'today' | 'yesterday' | 'earlier' {
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startY = new Date(startToday);
  startY.setDate(startY.getDate() - 1);
  if (d >= startToday) return 'today';
  if (d >= startY) return 'yesterday';
  return 'earlier';
}

function isUnread(n: Notif) {
  return !n.readAt && !n.isRead;
}

export function NotificationsPage() {
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    const data = await fetchNotifications();
    setItems((data.items as Notif[]) ?? []);
    setUnread(data.unread ?? 0);
  }, []);

  useEffect(() => {
    load()
      .catch(() => setItems([]))
      .finally(() => setLoading(false));

    const socket = connectSocket();
    function onNew(n: Notif) {
      setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)]);
      setUnread((u) => (n.readAt || n.isRead ? u : u + 1));
    }
    function onDeleted(payload: { id: string }) {
      setItems((prev) => {
        const gone = prev.find((x) => x.id === payload.id);
        if (gone && isUnread(gone)) {
          setUnread((u) => Math.max(0, u - 1));
        }
        return prev.filter((x) => x.id !== payload.id);
      });
    }
    function onRead() {
      // Mark-all / mark-read: keep history, only refresh unread badge via reload of counts
      void load();
    }
    function onFriendAccept() {
      void load();
    }
    socket.on('notification', onNew);
    socket.on('notification:new', onNew);
    socket.on('notification:deleted', onDeleted);
    socket.on('notification:read', onRead);
    socket.on('friend:accept', onFriendAccept);
    socket.on('friend:request', onFriendAccept);
    socket.on('friend:reject', onFriendAccept);
    return () => {
      socket.off('notification', onNew);
      socket.off('notification:new', onNew);
      socket.off('notification:deleted', onDeleted);
      socket.off('notification:read', onRead);
      socket.off('friend:accept', onFriendAccept);
      socket.off('friend:request', onFriendAccept);
      socket.off('friend:reject', onFriendAccept);
    };
  }, [load]);

  const visible = useMemo(() => {
    if (filter === 'unread') return items.filter(isUnread);
    if (filter === 'read') return items.filter((n) => !isUnread(n));
    return items;
  }, [items, filter]);

  const grouped = useMemo(() => {
    const g: Record<'today' | 'yesterday' | 'earlier', Notif[]> = {
      today: [],
      yesterday: [],
      earlier: [],
    };
    for (const n of visible) g[dayBucket(n.createdAt)].push(n);
    return g;
  }, [visible]);

  /** Mark all as read — never deletes rows. */
  async function markAll() {
    try {
      setError('');
      await markNotificationsRead();
      const now = new Date().toISOString();
      setItems((prev) =>
        prev.map((n) => ({
          ...n,
          readAt: n.readAt ?? now,
          isRead: true,
        })),
      );
      setUnread(0);
      setToast('All notifications marked as read');
      window.setTimeout(() => setToast(''), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not mark as read');
    }
  }

  async function markOneRead(n: Notif) {
    if (!isUnread(n)) return;
    try {
      await markNotificationsRead([n.id]);
      setItems((prev) =>
        prev.map((x) =>
          x.id === n.id
            ? { ...x, readAt: new Date().toISOString(), isRead: true }
            : x,
        ),
      );
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      /* ignore */
    }
  }

  async function accept(n: Notif) {
    const requestId = n.data?.requestId;
    const peerUserId = n.data?.userId;
    if (!requestId && !peerUserId) {
      setError('This friend request is missing its id. Refresh and try again.');
      return;
    }
    try {
      setBusyId(n.id);
      setError('');
      if (requestId) {
        await acceptFriendRequest(requestId);
      } else if (peerUserId) {
        await acceptFriendByUserId(peerUserId);
      }
      // Friend-request notif may be deleted server-side on accept — reload list
      await load();
      setToast('You are now friends');
      window.setTimeout(() => setToast(''), 2800);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Accept failed');
      void load();
    } finally {
      setBusyId(null);
    }
  }

  async function reject(n: Notif) {
    const requestId = n.data?.requestId;
    if (!requestId) {
      setError('Cannot reject — missing request id');
      return;
    }
    try {
      setBusyId(n.id);
      setError('');
      await rejectFriendRequest(requestId);
      await load();
      setToast('Request declined');
      window.setTimeout(() => setToast(''), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reject failed');
      void load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(n: Notif) {
    try {
      await deleteNotification(n.id);
      setItems((prev) => prev.filter((x) => x.id !== n.id));
      if (isUnread(n)) setUnread((u) => Math.max(0, u - 1));
    } catch {
      /* ignore */
    }
  }

  async function deleteAll() {
    if (!items.length) return;
    if (!window.confirm('Delete all notifications permanently?')) return;
    try {
      await api('/notifications/clear', { method: 'POST', body: JSON.stringify({}) });
      setItems([]);
      setUnread(0);
      setToast('All notifications deleted');
      window.setTimeout(() => setToast(''), 2200);
    } catch {
      // Fallback: delete one by one if clear endpoint missing
      try {
        await Promise.all(items.map((n) => deleteNotification(n.id)));
        setItems([]);
        setUnread(0);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Delete all failed');
      }
    }
  }

  function renderGroup(label: string, list: Notif[]) {
    if (!list.length) return null;
    return (
      <section key={label} className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</h2>
        {list.map((n) => {
          const Icon = icons[n.type] ?? Bell;
          const isFriendReq =
            n.type === 'FRIEND_REQUEST' && Boolean(n.data?.requestId || n.data?.userId);
          const unreadRow = isUnread(n);
          return (
            <div
              key={n.id}
              className={`glass-card flex gap-3 rounded-[22px] p-4 shadow-soft ${
                unreadRow ? 'ring-1 ring-primary/25' : 'opacity-90'
              }`}
            >
              <div className="rounded-2xl bg-primary/10 p-2 text-primary">
                <Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-slate-900 dark:text-white">{n.title}</p>
                  {unreadRow ? (
                    <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                      Unread
                    </span>
                  ) : (
                    <span className="shrink-0 text-[10px] text-slate-400">Read</span>
                  )}
                </div>
                <p className="text-sm text-slate-500">{n.body}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
                {isFriendReq ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="!min-h-10 w-auto px-4 text-xs"
                      loading={busyId === n.id}
                      onClick={() => void accept(n)}
                    >
                      <Check size={14} className="mr-1" /> Accept
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="!min-h-10 w-auto px-4 text-xs"
                      loading={busyId === n.id}
                      onClick={() => void reject(n)}
                    >
                      <X size={14} className="mr-1" /> Reject
                    </Button>
                    {n.data?.userId ? (
                      <Link
                        to={`/home/user/${n.data.userId}`}
                        className="inline-flex items-center rounded-full px-3 py-2 text-xs font-medium text-primary"
                      >
                        View profile
                      </Link>
                    ) : null}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {unreadRow ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                      onClick={() => void markOneRead(n)}
                    >
                      <CheckCheck size={14} /> Mark read
                    </button>
                  ) : null}
                </div>
              </div>
              <button
                type="button"
                className="touch-target shrink-0 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-error dark:hover:bg-slate-800"
                aria-label="Delete"
                onClick={() => void remove(n)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </section>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-float">
          {toast}
        </div>
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Notifications</h1>
          <p className="text-sm text-slate-500">
            Friends, messages, calls, events{unread ? ` · ${unread} unread` : ''}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {items.length ? (
            <>
              <Button
                type="button"
                variant="secondary"
                className="!min-h-10 w-auto px-3 text-xs"
                onClick={() => void markAll()}
              >
                Mark all read
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="!min-h-10 w-auto px-3 text-xs text-error"
                onClick={() => void deleteAll()}
              >
                Delete all
              </Button>
            </>
          ) : null}
        </div>
      </div>

      <div className="flex gap-2">
        {(['all', 'unread', 'read'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${
              filter === f
                ? 'bg-primary text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-error">{error}</p> : null}

      {loading ? (
        <div className="h-28 animate-pulse rounded-[24px] bg-slate-100 dark:bg-slate-800" />
      ) : visible.length === 0 ? (
        <div className="glass-card rounded-[28px] p-8 text-center text-slate-400 shadow-soft">
          {filter === 'unread'
            ? 'No unread notifications'
            : filter === 'read'
              ? 'No read notifications yet'
              : "You're all caught up"}
        </div>
      ) : (
        <div className="space-y-5">
          {renderGroup('Today', grouped.today)}
          {renderGroup('Yesterday', grouped.yesterday)}
          {renderGroup('Earlier', grouped.earlier)}
        </div>
      )}

      <Link to="/home/friends" className="block text-center text-sm font-medium text-primary">
        Manage friend requests →
      </Link>
    </div>
  );
}
