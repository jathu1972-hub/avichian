import { MessageCircle, Phone, Search, Video } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import {
  fetchCallHistory,
  fetchConversations,
  fetchFriends,
  openChatWithPeer,
  startCall,
} from '../../lib/social';
import { connectSocket } from '../../lib/socket';
import type { StudentSummary } from '../../types/social';

interface ConversationRow {
  id: string;
  peer: (StudentSummary & { online?: boolean }) | null;
  lastMessage: { body: string | null; createdAt: string; type?: string } | null;
  unreadCount?: number;
  updatedAt?: string;
}

interface CallRow {
  id: string;
  type: string;
  status: string;
  duration: number;
  startedAt: string;
  direction: string;
  peer: { id: string; name: string; profilePhotoUrl: string | null };
}

export function ChatPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [friends, setFriends] = useState<StudentSummary[]>([]);
  const [calls, setCalls] = useState<CallRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});

  async function load() {
    const [chats, friendList, history] = await Promise.all([
      fetchConversations(),
      fetchFriends(),
      fetchCallHistory().catch(() => []),
    ]);
    setConversations(chats);
    setFriends(friendList);
    setCalls(history as CallRow[]);
    const map: Record<string, boolean> = {};
    for (const f of friendList) {
      if (typeof (f as { online?: boolean }).online === 'boolean') {
        map[f.id] = Boolean((f as { online?: boolean }).online);
      }
    }
    for (const c of chats) {
      if (c.peer?.id && typeof c.peer.online === 'boolean') {
        map[c.peer.id] = Boolean(c.peer.online);
      }
    }
    setOnlineMap((prev) => ({ ...prev, ...map }));
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load chat'))
      .finally(() => setLoading(false));

    const socket = connectSocket();
    const onNotify = () => {
      void load().catch(() => undefined);
    };
    const onPresence = (payload: { userId: string; online: boolean }) => {
      setOnlineMap((prev) => ({ ...prev, [payload.userId]: payload.online }));
      setConversations((prev) =>
        prev.map((c) =>
          c.peer?.id === payload.userId
            ? { ...c, peer: c.peer ? { ...c.peer, online: payload.online } : c.peer }
            : c,
        ),
      );
    };
    socket.on('chat:notify', onNotify);
    socket.on('chat:message', onNotify);
    socket.on('presence:update', onPresence);
    socket.on('userOnline', (p: { userId: string }) => onPresence({ userId: p.userId, online: true }));
    socket.on('userOffline', (p: { userId: string }) => onPresence({ userId: p.userId, online: false }));

    return () => {
      socket.off('chat:notify', onNotify);
      socket.off('chat:message', onNotify);
      socket.off('presence:update', onPresence);
      socket.off('userOnline');
      socket.off('userOffline');
    };
  }, []);

  const filteredFriends = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.regNo.toLowerCase().includes(q) ||
        f.department.toLowerCase().includes(q),
    );
  }, [friends, query]);

  const filteredChats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        c.peer?.name.toLowerCase().includes(q) ||
        c.peer?.regNo.toLowerCase().includes(q) ||
        (c.lastMessage?.body || '').toLowerCase().includes(q),
    );
  }, [conversations, query]);

  async function openChat(peerId: string) {
    try {
      const chat = await openChatWithPeer(peerId);
      navigate(`/home/chat/${chat.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open chat — friends only');
    }
  }

  async function callPeer(peerId: string, type: 'VOICE' | 'VIDEO', name?: string) {
    try {
      const call = await startCall(peerId, type);
      const n = encodeURIComponent(name || call.peer?.name || '');
      const room = encodeURIComponent(call.roomName || '');
      navigate(
        `/home/call/${type === 'VOICE' ? 'voice' : 'video'}/${peerId}?callId=${call.id}&role=caller&name=${n}&room=${room}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Call failed — friends only');
    }
  }

  function formatDuration(sec: number) {
    if (!sec) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl min-w-0 space-y-4">
      <div>
        <h1 className="font-display text-fluid-2xl font-bold text-slate-900 dark:text-white">Chat</h1>
        <p className="text-fluid-sm text-slate-500">Live messaging & calls · accepted friends only</p>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search friends or chats…"
          className="min-h-11 w-full rounded-2xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      {error ? <p className="rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p> : null}

      {filteredChats.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Conversations</h2>
          {filteredChats.map((c) => {
            const online = c.peer?.id ? onlineMap[c.peer.id] ?? c.peer.online : false;
            const preview =
              c.lastMessage?.type && c.lastMessage.type !== 'TEXT' && !c.lastMessage.body
                ? c.lastMessage.type.toLowerCase()
                : c.lastMessage?.body ?? 'No messages yet';
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => navigate(`/home/chat/${c.id}`)}
                className="glass-card flex w-full items-center gap-3 rounded-[22px] p-3 text-left shadow-soft"
              >
                <div className="relative">
                  <StudentAvatar name={c.peer?.name ?? 'Friend'} photoUrl={c.peer?.profilePhotoUrl} size="md" />
                  {online ? (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-success" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900 dark:text-white">
                    {c.peer?.name ?? 'Friend'}
                  </p>
                  <p className="truncate text-xs text-slate-400">{preview}</p>
                </div>
                {(c.unreadCount ?? 0) > 0 ? (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
                    {c.unreadCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Friends</h2>
        {filteredFriends.length === 0 ? (
          <div className="glass-card rounded-[28px] p-8 text-center shadow-soft">
            <MessageCircle className="mx-auto text-primary" size={28} />
            <p className="mt-3 font-semibold">No friends yet</p>
            <p className="mt-1 text-sm text-slate-500">Search classmates and send a friend request.</p>
            <Link
              to="/home/search"
              className="mt-4 inline-block rounded-full bg-primary px-4 py-2 text-sm font-medium text-white"
            >
              Search students
            </Link>
          </div>
        ) : (
          filteredFriends.map((f) => {
            const online = onlineMap[f.id] ?? (f as { online?: boolean }).online;
            return (
              <div key={f.id} className="glass-card flex items-center gap-3 rounded-[22px] p-3 shadow-soft">
                <div className="relative">
                  <StudentAvatar name={f.name} photoUrl={f.profilePhotoUrl} size="md" />
                  {online ? (
                    <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-success" />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900 dark:text-white">{f.name}</p>
                  <p className="text-xs text-slate-400">
                    {f.department}
                    {online ? ' · Online' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void callPeer(f.id, 'VOICE', f.name)}
                  className="rounded-full bg-success/10 p-2 text-success"
                  aria-label="Voice call"
                >
                  <Phone size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => void callPeer(f.id, 'VIDEO', f.name)}
                  className="rounded-full bg-primary/10 p-2 text-primary"
                  aria-label="Video call"
                >
                  <Video size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => void openChat(f.id)}
                  className="rounded-full bg-slate-100 p-2 text-slate-600 dark:bg-slate-800"
                  aria-label="Chat"
                >
                  <MessageCircle size={16} />
                </button>
              </div>
            );
          })
        )}
      </section>

      {calls.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Call history</h2>
          {calls.slice(0, 15).map((c) => (
            <div key={c.id} className="glass-card flex items-center gap-3 rounded-[20px] px-3 py-2.5 shadow-soft">
              <div className="rounded-full bg-slate-100 p-2 dark:bg-slate-800">
                {c.type === 'VIDEO' ? <Video size={14} /> : <Phone size={14} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.peer.name}</p>
                <p className="text-[11px] text-slate-400">
                  {c.direction} · {c.status.toLowerCase()} · {formatDuration(c.duration)} ·{' '}
                  {new Date(c.startedAt).toLocaleString()}
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-medium text-primary"
                onClick={() => void callPeer(c.peer.id, c.type === 'VIDEO' ? 'VIDEO' : 'VOICE', c.peer.name)}
              >
                Call
              </button>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
