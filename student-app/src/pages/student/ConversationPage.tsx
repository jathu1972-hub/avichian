import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  FileText,
  MoreVertical,
  Paperclip,
  Phone,
  Reply,
  Send,
  Smile,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import { useAuth } from '../../context/AuthContext';
import { resolveMediaUrl } from '../../lib/config';
import {
  deleteChatMessage,
  editChatMessage,
  fetchConversations,
  fetchMessages,
  markChatRead,
  sendChatMessage,
  startCall,
  uploadMedia,
  type ChatMessageDto,
} from '../../lib/social';
import {
  connectSocket,
  emitTyping,
  joinConversation,
  leaveConversation,
  markChatSeen,
} from '../../lib/socket';

type ChatMessage = ChatMessageDto & { pending?: boolean; failed?: boolean; clientKey?: string };

/** Always derive ownership from authenticated user id — never trust socket isMine alone. */
function isSentByMe(msg: { senderId?: string | null; isMine?: boolean }, myId: string | undefined): boolean {
  if (myId && msg.senderId) {
    return msg.senderId === myId;
  }
  return Boolean(msg.isMine);
}

function sameDay(a: string, b: string) {
  const da = new Date(a);
  const db = new Date(b);
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function formatDayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(iso, today.toISOString())) return 'Today';
  if (sameDay(iso, yesterday.toISOString())) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const EMOJIS = ['😀', '😂', '❤️', '👍', '🔥', '🎉', '🙏', '😍', '👏', '💯'];

export function ConversationPage() {
  const { userId: conversationId = '' } = useParams();
  const { user } = useAuth();
  const myId = user?.id;
  const navigate = useNavigate();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [peer, setPeer] = useState<{
    id: string;
    name: string;
    profilePhotoUrl?: string | null;
    online?: boolean;
  } | null>(null);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<number | null>(null);
  const myIdRef = useRef(myId);
  myIdRef.current = myId;

  const normalizeMessage = useCallback((msg: ChatMessage): ChatMessage => {
    const mine = isSentByMe(msg, myIdRef.current);
    return {
      ...msg,
      isMine: mine,
      conversationId: msg.conversationId || conversationId,
    };
  }, [conversationId]);

  const upsertMessage = useCallback(
    (raw: ChatMessage) => {
      const msg = normalizeMessage(raw);
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msg.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...msg, pending: false, failed: false };
          return next;
        }
        // Replace optimistic temp when server ack matches
        const withoutTemp = prev.filter(
          (m) =>
            !(
              m.pending &&
              m.body === msg.body &&
              isSentByMe(m, myIdRef.current) &&
              isSentByMe(msg, myIdRef.current)
            ),
        );
        return [...withoutTemp, msg];
      });
    },
    [normalizeMessage],
  );

  useEffect(() => {
    if (!conversationId) return;
    let active = true;

    Promise.all([fetchMessages(conversationId), fetchConversations()])
      .then(([data, chats]) => {
        if (!active) return;
        setMessages(data.map((m) => normalizeMessage(m)));
        const chat = chats.find((c) => c.id === conversationId);
        if (chat?.peer) {
          setPeer({
            id: chat.peer.id,
            name: chat.peer.name,
            profilePhotoUrl: chat.peer.profilePhotoUrl,
            online: chat.peer.online,
          });
        }
        void markChatRead(conversationId).catch(() => undefined);
        markChatSeen(conversationId);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load messages'))
      .finally(() => {
        if (active) setLoading(false);
      });

    const socket = connectSocket();
    joinConversation(conversationId);

    const onMessage = (msg: ChatMessage) => {
      if (msg.conversationId && msg.conversationId !== conversationId) return;
      const normalized = normalizeMessage(msg);
      upsertMessage(normalized);
      if (!isSentByMe(normalized, myIdRef.current)) {
        markChatSeen(conversationId);
        void markChatRead(conversationId).catch(() => undefined);
      }
    };

    const onUpdated = (msg: ChatMessage) => {
      if (msg.conversationId && msg.conversationId !== conversationId) return;
      upsertMessage(msg);
    };

    const onDeleted = (msg: ChatMessage) => {
      if (msg.conversationId && msg.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msg.id
            ? { ...m, deleted: true, body: null, mediaUrl: null, fileName: null }
            : m,
        ),
      );
    };

    const onTyping = (payload: { conversationId: string; typing: boolean; userId: string }) => {
      if (payload.conversationId !== conversationId) return;
      if (myIdRef.current && payload.userId === myIdRef.current) return;
      setTyping(Boolean(payload.typing));
    };

    const onSeen = (payload: { conversationId: string; seenAt: string }) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          isSentByMe(m, myIdRef.current) && !m.seenAt
            ? { ...m, seenAt: payload.seenAt, deliveredAt: m.deliveredAt || payload.seenAt }
            : m,
        ),
      );
    };

    const onDelivered = (payload: { conversationId: string; deliveredAt: string }) => {
      if (payload.conversationId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) =>
          isSentByMe(m, myIdRef.current) && !m.deliveredAt
            ? { ...m, deliveredAt: payload.deliveredAt }
            : m,
        ),
      );
    };

    const onPresence = (payload: { userId: string; online: boolean }) => {
      setPeer((p) => (p && p.id === payload.userId ? { ...p, online: payload.online } : p));
    };

    socket.on('chat:message', onMessage);
    socket.on('receiveMessage', onMessage);
    socket.on('chat:message:updated', onUpdated);
    socket.on('chat:message:deleted', onDeleted);
    socket.on('chat:typing', onTyping);
    socket.on('typing', onTyping);
    socket.on('chat:message:seen', onSeen);
    socket.on('messageSeen', onSeen);
    socket.on('chat:message:delivered', onDelivered);
    socket.on('messageDelivered', onDelivered);
    socket.on('presence:update', onPresence);

    return () => {
      active = false;
      leaveConversation(conversationId);
      emitTyping(conversationId, false);
      socket.off('chat:message', onMessage);
      socket.off('receiveMessage', onMessage);
      socket.off('chat:message:updated', onUpdated);
      socket.off('chat:message:deleted', onDeleted);
      socket.off('chat:typing', onTyping);
      socket.off('typing', onTyping);
      socket.off('chat:message:seen', onSeen);
      socket.off('messageSeen', onSeen);
      socket.off('chat:message:delivered', onDelivered);
      socket.off('messageDelivered', onDelivered);
      socket.off('presence:update', onPresence);
    };
  }, [conversationId, normalizeMessage, upsertMessage]);

  // Re-normalize when auth user id becomes available
  useEffect(() => {
    if (!myId) return;
    setMessages((prev) => prev.map((m) => ({ ...m, isMine: isSentByMe(m, myId) })));
  }, [myId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, typing]);

  const rows = useMemo(() => {
    const out: Array<{ type: 'day'; label: string; key: string } | { type: 'msg'; msg: ChatMessage }> =
      [];
    let lastDay = '';
    for (const msg of messages) {
      const day = formatDayLabel(msg.createdAt);
      if (day !== lastDay) {
        out.push({ type: 'day', label: day, key: `day-${msg.createdAt}` });
        lastDay = day;
      }
      out.push({ type: 'msg', msg });
    }
    return out;
  }, [messages]);

  function onTextChange(value: string) {
    setText(value);
    if (!conversationId) return;
    emitTyping(conversationId, value.length > 0);
    if (typingTimer.current) window.clearTimeout(typingTimer.current);
    typingTimer.current = window.setTimeout(() => emitTyping(conversationId, false), 1800);
  }

  async function send() {
    if (!conversationId || sending) return;
    const body = text.trim();
    if (!body) return;

    if (editingId) {
      try {
        setSending(true);
        const updated = await editChatMessage(editingId, body);
        upsertMessage(updated);
        setEditingId(null);
        setText('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Edit failed');
      } finally {
        setSending(false);
      }
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      conversationId,
      body,
      type: 'TEXT',
      mediaUrl: null,
      senderId: myId || 'me',
      createdAt: new Date().toISOString(),
      isMine: true,
      seenAt: null,
      deliveredAt: null,
      pending: true,
      replyToId: replyTo?.id ?? null,
      replyTo: replyTo
        ? {
            id: replyTo.id,
            body: replyTo.body,
            type: replyTo.type,
            senderId: replyTo.senderId,
            mediaUrl: replyTo.mediaUrl,
          }
        : null,
    };

    setMessages((prev) => [...prev, optimistic]);
    setText('');
    const replyId = replyTo?.id;
    setReplyTo(null);
    setShowEmoji(false);
    emitTyping(conversationId, false);
    setSending(true);
    setError('');

    try {
      const saved = await sendChatMessage(conversationId, {
        body,
        type: 'TEXT',
        replyToId: replyId,
      });
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      upsertMessage(saved);
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, pending: false, failed: true } : m)),
      );
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  async function onPickFile(file: File) {
    if (!conversationId || !file) return;
    setUploading(true);
    setError('');
    try {
      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      const purpose = isVideo ? 'post_video' : isImage ? 'post_image' : 'document';
      const uploaded = await uploadMedia(file, purpose as 'post_image' | 'post_video' | 'document');
      const type = isVideo ? 'VIDEO' : isPdf ? 'PDF' : 'IMAGE';
      const saved = await sendChatMessage(conversationId, {
        type,
        mediaUrl: uploaded.url,
        fileName: file.name,
        body: text.trim() || undefined,
        replyToId: replyTo?.id,
      });
      upsertMessage(saved);
      setText('');
      setReplyTo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function call(type: 'VOICE' | 'VIDEO') {
    if (!peer?.id) {
      setError('Peer not loaded — reopen chat from friends list');
      return;
    }
    try {
      const callData = await startCall(peer.id, type);
      const name = encodeURIComponent(peer.name || callData.peer?.name || '');
      const room = encodeURIComponent(callData.roomName || '');
      navigate(
        `/home/call/${type === 'VOICE' ? 'voice' : 'video'}/${peer.id}?callId=${callData.id}&role=caller&name=${name}&room=${room}`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Call failed');
    }
  }

  async function removeMessage(id: string) {
    if (!window.confirm('Delete this message?')) return;
    try {
      const deleted = await deleteChatMessage(id);
      upsertMessage({ ...deleted, deleted: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  function receiptIcon(m: ChatMessage, mine: boolean) {
    if (!mine || m.deleted) return null;
    if (m.pending) return <span className="text-[10px] opacity-70">…</span>;
    if (m.failed) return <span className="text-[10px] text-red-300">!</span>;
    if (m.seenAt) return <CheckCheck size={13} className="text-sky-200" strokeWidth={2.5} />;
    if (m.deliveredAt) return <CheckCheck size={13} className="opacity-70" strokeWidth={2.5} />;
    return <Check size={13} className="opacity-60" strokeWidth={2.5} />;
  }

  function renderBody(m: ChatMessage, mine: boolean) {
    if (m.deleted) {
      return (
        <p className={`text-sm italic ${mine ? 'text-white/70' : 'text-slate-400'}`}>
          Message deleted
        </p>
      );
    }
    const url = resolveMediaUrl(m.mediaUrl) ?? m.mediaUrl;
    if (url && m.type === 'IMAGE') {
      return (
        <div className="space-y-1.5">
          <img
            src={url}
            alt=""
            className="max-h-56 w-full max-w-[min(100%,16rem)] rounded-2xl object-cover"
          />
          {m.body ? <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.body}</p> : null}
        </div>
      );
    }
    if (url && m.type === 'VIDEO') {
      return (
        <div className="space-y-1.5">
          <video
            src={url}
            controls
            playsInline
            className="max-h-56 w-full max-w-[min(100%,16rem)] rounded-2xl"
          />
          {m.body ? <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.body}</p> : null}
        </div>
      );
    }
    if (url && (m.type === 'PDF' || m.type === 'VOICE')) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center gap-2 text-[15px] underline ${mine ? 'text-white' : 'text-primary'}`}
        >
          <FileText size={16} />
          <span className="break-all">{m.fileName || 'Attachment'}</span>
        </a>
      );
    }
    return (
      <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.body}</p>
    );
  }

  return (
    <div className="chat-thread relative mx-auto flex max-h-[min(80dvh,860px)] min-h-[min(70dvh,520px)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/40 bg-gradient-to-b from-slate-50/90 via-white/80 to-primary/[0.06] shadow-float backdrop-blur-xl dark:border-slate-700/60 dark:from-slate-900/90 dark:via-slate-900/80 dark:to-slate-950 lg:h-[min(80dvh,820px)] lg:max-h-none">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b border-white/50 bg-white/70 px-2 py-2.5 backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-900/70 sm:gap-3 sm:px-3">
        <Link
          to="/home/chat"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </Link>

        <StudentAvatar name={peer?.name ?? 'Chat'} photoUrl={peer?.profilePhotoUrl} size="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[15px] font-semibold text-slate-900 dark:text-white">
            {peer?.name ?? 'Chat'}
          </p>
          <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
            {typing ? (
              <span className="font-medium text-primary">typing…</span>
            ) : peer?.online ? (
              <>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-success" />
                Online
              </>
            ) : (
              'Offline'
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void call('VOICE')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success transition active:scale-95"
          aria-label="Voice call"
        >
          <Phone size={18} />
        </button>
        <button
          type="button"
          onClick={() => void call('VIDEO')}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary transition active:scale-95"
          aria-label="Video call"
        >
          <Video size={18} />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="More"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-11 z-30 min-w-[140px] rounded-2xl border border-slate-100 bg-white/95 p-1 shadow-float backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95">
              <Link
                to={peer?.id ? `/home/user/${peer.id}` : '/home/chat'}
                className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                onClick={() => setMenuOpen(false)}
              >
                View profile
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="shrink-0 bg-error/10 px-4 py-2 text-center text-xs text-error">{error}</p>
      ) : null}

      {/* Messages */}
      <div
        ref={listRef}
        className="chat-messages min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 py-3 sm:px-4"
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-2xl">
              💬
            </div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">No messages yet</p>
            <p className="mt-1 max-w-xs text-sm text-slate-500">
              Say hello to {peer?.name?.split(' ')[0] ?? 'your friend'}. Messages sync in real time.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {rows.map((row) => {
              if (row.type === 'day') {
                return (
                  <div key={row.key} className="flex justify-center py-3">
                    <span className="rounded-full bg-white/70 px-3 py-1 text-[11px] font-medium text-slate-500 shadow-sm backdrop-blur dark:bg-slate-800/80 dark:text-slate-400">
                      {row.label}
                    </span>
                  </div>
                );
              }

              const m = row.msg;
              const mine = isSentByMe(m, myId);

              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className={`flex w-full min-w-0 items-end gap-2 ${
                    mine ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {/* Received: avatar left */}
                  {!mine ? (
                    <div className="mb-0.5 shrink-0 self-end">
                      <StudentAvatar
                        name={peer?.name ?? 'User'}
                        photoUrl={peer?.profilePhotoUrl}
                        size="sm"
                      />
                    </div>
                  ) : null}

                  <div
                    className={`group relative max-w-[min(82%,22rem)] min-w-0 sm:max-w-[min(72%,26rem)] ${
                      mine ? 'items-end' : 'items-start'
                    }`}
                  >
                    <div
                      className={[
                        'rounded-[22px] px-3.5 py-2.5 shadow-sm',
                        mine
                          ? 'rounded-br-md bg-gradient-to-br from-primary to-blue-600 text-white'
                          : 'rounded-bl-md border border-white/60 bg-white/85 text-slate-800 backdrop-blur-md dark:border-slate-600/50 dark:bg-slate-800/90 dark:text-slate-100',
                        m.failed ? 'ring-2 ring-error/50' : '',
                      ].join(' ')}
                    >
                      {m.replyTo ? (
                        <div
                          className={`mb-1.5 border-l-2 pl-2 text-[11px] leading-snug opacity-80 ${
                            mine ? 'border-white/50' : 'border-primary/40'
                          }`}
                        >
                          {m.replyTo.deleted
                            ? 'Deleted message'
                            : m.replyTo.body || 'Attachment'}
                        </div>
                      ) : null}

                      {renderBody(m, mine)}

                      <div
                        className={`mt-1 flex items-center gap-1 ${
                          mine ? 'justify-end text-white/70' : 'justify-end text-slate-400'
                        }`}
                      >
                        {m.editedAt && !m.deleted ? (
                          <span className="text-[10px]">edited</span>
                        ) : null}
                        <span className="text-[10px] tabular-nums">{formatTime(m.createdAt)}</span>
                        {receiptIcon(m, mine)}
                      </div>
                    </div>

                    {/* Actions */}
                    {!m.deleted && !m.pending ? (
                      <div
                        className={`mt-0.5 flex gap-1 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 ${
                          mine ? 'justify-end' : 'justify-start'
                        }`}
                      >
                        <button
                          type="button"
                          className="rounded-full bg-white/80 p-1.5 text-slate-500 shadow-sm dark:bg-slate-800"
                          onClick={() => setReplyTo(m)}
                          aria-label="Reply"
                        >
                          <Reply size={12} />
                        </button>
                        {mine && m.type === 'TEXT' ? (
                          <button
                            type="button"
                            className="rounded-full bg-white/80 px-2 py-1 text-[10px] font-medium text-slate-500 shadow-sm dark:bg-slate-800"
                            onClick={() => {
                              setEditingId(m.id);
                              setText(m.body || '');
                              inputRef.current?.focus();
                            }}
                          >
                            Edit
                          </button>
                        ) : null}
                        {mine ? (
                          <button
                            type="button"
                            className="rounded-full bg-white/80 p-1.5 text-error shadow-sm dark:bg-slate-800"
                            onClick={() => void removeMessage(m.id)}
                            aria-label="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {/* Sent: no avatar (cleaner iMessage-style), spacer for symmetry */}
                  {mine ? <div className="w-0 shrink-0 sm:w-1" aria-hidden /> : null}
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}

        {typing ? (
          <div className="flex items-end gap-2 justify-start pl-1">
            <StudentAvatar
              name={peer?.name ?? 'User'}
              photoUrl={peer?.profilePhotoUrl}
              size="sm"
            />
            <div className="flex gap-1 rounded-[20px] rounded-bl-md border border-white/60 bg-white/90 px-3.5 py-3 shadow-sm backdrop-blur dark:border-slate-600 dark:bg-slate-800">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:240ms]" />
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} className="h-1" />
      </div>

      {/* Reply / edit bar */}
      {(replyTo || editingId) && (
        <div className="flex shrink-0 items-center gap-2 border-t border-slate-100/80 bg-white/60 px-3 py-2 text-xs backdrop-blur dark:border-slate-700 dark:bg-slate-900/60">
          <div className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">
            {editingId
              ? 'Editing message'
              : `Replying to: ${replyTo?.body || 'attachment'}`}
          </div>
          <button
            type="button"
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={() => {
              setReplyTo(null);
              setEditingId(null);
              setText('');
            }}
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Emoji strip */}
      {showEmoji ? (
        <div className="flex shrink-0 flex-wrap gap-1 border-t border-slate-100/80 bg-white/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/70">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              className="rounded-lg px-2 py-1 text-lg transition hover:bg-slate-100 active:scale-90 dark:hover:bg-slate-800"
              onClick={() => {
                setText((t) => t + e);
                inputRef.current?.focus();
              }}
            >
              {e}
            </button>
          ))}
        </div>
      ) : null}

      {/* Composer */}
      <div className="sticky bottom-0 z-20 shrink-0 border-t border-white/50 bg-white/80 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-900/80 sm:px-3">
        <div className="flex items-end gap-1.5 sm:gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/*,.pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPickFile(f);
            }}
          />
          <button
            type="button"
            disabled={uploading || Boolean(editingId)}
            onClick={() => fileRef.current?.click()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition active:scale-95 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-300"
            aria-label="Attach file"
          >
            <Paperclip size={18} className={uploading ? 'animate-pulse' : ''} />
          </button>
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition active:scale-95 dark:bg-slate-800 dark:text-slate-300"
            aria-label="Emoji"
          >
            <Smile size={18} />
          </button>

          <textarea
            ref={inputRef}
            value={text}
            rows={1}
            onChange={(e) => {
              onTextChange(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={editingId ? 'Edit message…' : 'Message…'}
            className="max-h-[120px] min-h-11 flex-1 resize-none rounded-[22px] border border-slate-200/80 bg-white/90 px-4 py-2.5 text-[15px] text-slate-900 outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/15 dark:border-slate-600 dark:bg-slate-800/90 dark:text-white"
          />

          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            disabled={sending || !text.trim()}
            onClick={() => void send()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-blue-600 text-white shadow-float transition disabled:opacity-40"
            aria-label="Send"
          >
            <Send size={18} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
