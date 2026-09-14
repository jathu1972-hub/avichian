import { MessageCircle, MoreVertical, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { ReportDialog } from '../../components/student/ReportDialog';
import {
  blockConversationPeer,
  fetchConversations,
  hideConversation,
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

export function ChatPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});
  const [menuId, setMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConversationRow | null>(null);
  const [blockTarget, setBlockTarget] = useState<ConversationRow | null>(null);
  const [reportTarget, setReportTarget] = useState<ConversationRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const chats = await fetchConversations();
    setConversations(chats);
    const map: Record<string, boolean> = {};
    for (const c of chats) {
      if (c.peer?.id && typeof c.peer.online === 'boolean') {
        map[c.peer.id] = Boolean(c.peer.online);
      }
    }
    setOnlineMap((prev) => ({ ...prev, ...map }));
  }, []);

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
    socket.on('userOnline', (p: { userId: string }) =>
      onPresence({ userId: p.userId, online: true }),
    );
    socket.on('userOffline', (p: { userId: string }) =>
      onPresence({ userId: p.userId, online: false }),
    );

    return () => {
      socket.off('chat:notify', onNotify);
      socket.off('chat:message', onNotify);
      socket.off('presence:update', onPresence);
      socket.off('userOnline');
      socket.off('userOffline');
    };
  }, [load]);

  // Search only within existing conversations (friends)
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

  async function confirmDelete() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await hideConversation(deleteTarget.id);
      setConversations((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete chat');
    } finally {
      setBusy(false);
    }
  }

  async function confirmBlock() {
    if (!blockTarget) return;
    setBusy(true);
    try {
      await blockConversationPeer(blockTarget.id);
      setConversations((prev) => prev.filter((c) => c.id !== blockTarget.id));
      setBlockTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not block user');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="chat-directory mx-auto w-full max-w-2xl min-w-0 space-y-4">
      <div className="px-0.5">
        <h1 className="font-display text-fluid-2xl font-extrabold tracking-tight text-slate-900 dark:text-zinc-50">
          Chat
        </h1>
        <p className="text-fluid-sm font-medium text-slate-500 dark:text-zinc-400">
          Conversations with friends
        </p>
      </div>

      <div className="relative">
        <Search
          size={16}
          className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations…"
          className="min-h-12 w-full rounded-full border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-sm font-medium text-slate-900 shadow-soft outline-none placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/12 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      </div>

      {error ? (
        <p className="toast-premium border border-error/20 bg-error/10 text-error">{error}</p>
      ) : null}

      {filteredChats.length === 0 ? (
        <div className="premium-card p-8 text-center">
          <MessageCircle className="mx-auto text-primary" size={28} />
          <p className="mt-3 font-semibold text-slate-900 dark:text-zinc-50">No conversations</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
            Message friends from their profile or the Friends page.
          </p>
          <Link
            to="/home/friends"
            className="mt-4 inline-block rounded-full bg-primary px-4 py-2 text-sm font-medium text-white"
          >
            Go to Friends
          </Link>
        </div>
      ) : (
        <section className="space-y-2">
          {filteredChats.map((c) => {
            const online = c.peer?.id ? onlineMap[c.peer.id] ?? c.peer.online : false;
            const preview =
              c.lastMessage?.type && c.lastMessage.type !== 'TEXT' && !c.lastMessage.body
                ? c.lastMessage.type.toLowerCase()
                : c.lastMessage?.body ?? 'No messages yet';
            return (
              <div
                key={c.id}
                className="premium-card relative flex w-full items-center gap-3 p-3.5"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenuId(c.id);
                }}
                onTouchStart={(e) => {
                  const t = window.setTimeout(() => setMenuId(c.id), 500);
                  const clear = () => window.clearTimeout(t);
                  e.currentTarget.addEventListener('touchend', clear, { once: true });
                  e.currentTarget.addEventListener('touchmove', clear, { once: true });
                }}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => navigate(`/home/chat/${c.id}`)}
                >
                  <div className="relative shrink-0">
                    <StudentAvatar
                      name={c.peer?.name ?? 'Friend'}
                      photoUrl={c.peer?.profilePhotoUrl}
                      size="md"
                    />
                    {online ? (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-success dark:border-zinc-900" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900 dark:text-zinc-50">
                      {c.peer?.name ?? 'Friend'}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-zinc-400">{preview}</p>
                  </div>
                  {(c.unreadCount ?? 0) > 0 ? (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">
                      {c.unreadCount}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                  aria-label="Conversation options"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuId((id) => (id === c.id ? null : c.id));
                  }}
                >
                  <MoreVertical size={18} />
                </button>
                {menuId === c.id ? (
                  <>
                    <button
                      type="button"
                      className="fixed inset-0 z-20 cursor-default"
                      aria-label="Close menu"
                      onClick={() => setMenuId(null)}
                    />
                    <div className="absolute right-3 top-14 z-30 min-w-[11rem] rounded-2xl border border-slate-200 bg-white p-1 shadow-float dark:border-zinc-700 dark:bg-zinc-900">
                      <button
                        type="button"
                        className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-error hover:bg-error/10"
                        onClick={() => {
                          setMenuId(null);
                          setDeleteTarget(c);
                        }}
                      >
                        Delete Chat
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
                        onClick={() => {
                          setMenuId(null);
                          setBlockTarget(c);
                        }}
                      >
                        Block User
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 dark:text-zinc-100 dark:hover:bg-zinc-800"
                        onClick={() => {
                          setMenuId(null);
                          setReportTarget(c);
                        }}
                      >
                        Report User
                      </button>
                      <button
                        type="button"
                        className="block w-full rounded-xl px-3 py-2.5 text-left text-sm text-slate-500 hover:bg-slate-50 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        onClick={() => setMenuId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this conversation?"
        message="This removes the conversation from your chat list only. Your friend will still see it."
        confirmLabel="Delete"
        loading={busy}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
      <ConfirmDialog
        open={Boolean(blockTarget)}
        title="Block this person?"
        message="They will not be able to message or call you. The chat will be removed from your list."
        confirmLabel="Block"
        loading={busy}
        onCancel={() => setBlockTarget(null)}
        onConfirm={() => void confirmBlock()}
      />
      {reportTarget?.peer?.id ? (
        <ReportDialog
          open
          onClose={() => setReportTarget(null)}
          targetType="USER"
          targetId={reportTarget.peer.id}
          targetUserId={reportTarget.peer.id}
          onDone={() => setReportTarget(null)}
        />
      ) : null}
    </div>
  );
}
