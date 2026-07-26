import { ArrowLeft, Phone, Send, Video } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { fetchConversations, fetchMessages, sendChatMessage, startCall } from '../../lib/social';
import { connectSocket } from '../../lib/socket';

interface ChatMessage {
  id: string;
  body: string | null;
  type: string;
  senderId: string;
  createdAt: string;
  isMine: boolean;
  seenAt?: string | null;
}

export function ConversationPage() {
  const { userId: conversationId = '' } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState('');
  const [peerId, setPeerId] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    Promise.all([fetchMessages(conversationId), fetchConversations()])
      .then(([data, chats]) => {
        if (!active) return;
        setMessages(data);
        const chat = chats.find((c) => c.id === conversationId);
        if (chat?.peer?.id) setPeerId(chat.peer.id);
        else {
          const other = data.find((m) => !m.isMine);
          if (other) setPeerId(other.senderId);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load messages'))
      .finally(() => setLoading(false));

    const socket = connectSocket();
    socket.emit('chat:join', conversationId);

    const onMessage = (msg: ChatMessage & { conversationId?: string }) => {
      if (msg.id) {
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, { ...msg, isMine: false }]));
      }
    };
    const onTyping = (payload: { conversationId: string; typing: boolean; userId: string }) => {
      if (payload.conversationId === conversationId) setTyping(payload.typing);
    };

    socket.on('chat:message', onMessage);
    socket.on('chat:typing', onTyping);

    return () => {
      active = false;
      socket.off('chat:message', onMessage);
      socket.off('chat:typing', onTyping);
    };
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  async function send() {
    if (!text.trim() || !conversationId) return;
    const body = text.trim();
    setText('');
    try {
      const socket = connectSocket();
      socket.emit('chat:typing', { conversationId, typing: false });

      // Prefer REST so message is always persisted even if socket drops
      const saved = (await sendChatMessage(conversationId, { body, type: 'TEXT' })) as ChatMessage;
      setMessages((prev) => [...prev, { ...saved, isMine: true }]);
      if (!peerId && saved.senderId) {
        /* peer from load */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    }
  }

  async function call(type: 'VOICE' | 'VIDEO') {
    if (!peerId) {
      setError('Open chat from friends list to enable calls');
      return;
    }
    try {
      const call = await startCall(peerId, type);
      navigate(`/home/call/${type === 'VOICE' ? 'voice' : 'video'}/${peerId}?callId=${call.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Call failed');
    }
  }

  return (
    <div className="flex min-h-[70dvh] flex-col">
      <div className="mb-3 flex items-center gap-3">
        <Link to="/home/chat" className="rounded-full p-2 hover:bg-slate-100">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <p className="font-semibold">Chat</p>
          <p className="text-xs text-slate-400">{typing ? 'Typing…' : 'Friends only · realtime'}</p>
        </div>
        <button type="button" onClick={() => call('VOICE')} className="rounded-full bg-success/10 p-2 text-success">
          <Phone size={16} />
        </button>
        <button type="button" onClick={() => call('VIDEO')} className="rounded-full bg-primary/10 p-2 text-primary">
          <Video size={16} />
        </button>
      </div>

      {error ? <p className="mb-2 text-sm text-error">{error}</p> : null}

      <div className="glass-card flex flex-1 flex-col rounded-[24px] p-4 shadow-soft">
        <div className="flex-1 space-y-3 overflow-y-auto">
          {loading ? (
            <p className="text-center text-sm text-slate-400">Loading…</p>
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-slate-400">Say hello 👋</p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.isMine ? 'ml-auto bg-primary text-white' : 'bg-slate-100 text-slate-800'
                }`}
              >
                {m.body}
                {m.isMine && m.seenAt ? (
                  <p className="mt-1 text-[10px] opacity-70">Seen</p>
                ) : null}
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3">
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              connectSocket().emit('chat:typing', {
                conversationId,
                typing: e.target.value.length > 0,
              });
            }}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Message…"
            className="min-h-11 flex-1 rounded-[18px] border border-slate-200 bg-white px-3 text-sm outline-none focus:border-primary"
          />
          <Button type="button" className="w-auto !min-h-11 !px-3" onClick={send}>
            <Send size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
