import { MessageCircle, Phone, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import { fetchConversations, fetchFriends, openChatWithPeer, startCall } from '../../lib/social';
import type { StudentSummary } from '../../types/social';

interface ConversationRow {
  id: string;
  peer: (StudentSummary & { online?: boolean }) | null;
  lastMessage: { body: string | null; createdAt: string } | null;
}

export function ChatPage() {
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [friends, setFriends] = useState<StudentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([fetchConversations(), fetchFriends()])
      .then(([chats, friendList]) => {
        setConversations(chats);
        setFriends(friendList);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load chat'))
      .finally(() => setLoading(false));
  }, []);

  async function openChat(peerId: string) {
    try {
      const chat = await openChatWithPeer(peerId);
      navigate(`/home/chat/${chat.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open chat — friends only');
    }
  }

  async function callPeer(peerId: string, type: 'VOICE' | 'VIDEO') {
    try {
      const call = await startCall(peerId, type);
      navigate(`/home/call/${type === 'VOICE' ? 'voice' : 'video'}/${peerId}?callId=${call.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Call failed — friends only');
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
    <div className="mx-auto w-full max-w-2xl min-w-0 space-y-4">
      <div>
        <h1 className="font-display text-fluid-2xl font-bold text-slate-900">Chat</h1>
        <p className="text-fluid-sm text-slate-500">Message and call accepted friends only</p>
      </div>

      {error ? <p className="rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p> : null}

      {conversations.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Conversations</h2>
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => navigate(`/home/chat/${c.id}`)}
              className="glass-card flex w-full items-center gap-3 rounded-[22px] p-3 text-left shadow-soft"
            >
              <StudentAvatar name={c.peer?.name ?? 'Friend'} photoUrl={c.peer?.profilePhotoUrl} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{c.peer?.name ?? 'Friend'}</p>
                <p className="truncate text-xs text-slate-400">
                  {c.lastMessage?.body ?? 'No messages yet'}
                </p>
              </div>
              {c.peer?.online ? (
                <span className="h-2.5 w-2.5 rounded-full bg-success" title="Online" />
              ) : null}
            </button>
          ))}
        </section>
      ) : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">Friends</h2>
        {friends.length === 0 ? (
          <div className="glass-card rounded-[28px] p-8 text-center shadow-soft">
            <MessageCircle className="mx-auto text-primary" size={28} />
            <p className="mt-3 font-semibold">No friends yet</p>
            <p className="mt-1 text-sm text-slate-500">Search classmates and send a follow request.</p>
            <Link to="/home/search" className="mt-4 inline-block rounded-full bg-primary px-4 py-2 text-sm font-medium text-white">
              Search students
            </Link>
          </div>
        ) : (
          friends.map((f) => (
            <div key={f.id} className="glass-card flex items-center gap-3 rounded-[22px] p-3 shadow-soft">
              <StudentAvatar name={f.name} photoUrl={f.profilePhotoUrl} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{f.name}</p>
                <p className="text-xs text-slate-400">{f.department}</p>
              </div>
              <button type="button" onClick={() => callPeer(f.id, 'VOICE')} className="rounded-full bg-success/10 p-2 text-success" aria-label="Voice call">
                <Phone size={16} />
              </button>
              <button type="button" onClick={() => callPeer(f.id, 'VIDEO')} className="rounded-full bg-primary/10 p-2 text-primary" aria-label="Video call">
                <Video size={16} />
              </button>
              <button type="button" onClick={() => openChat(f.id)} className="rounded-full bg-slate-100 p-2 text-slate-600" aria-label="Chat">
                <MessageCircle size={16} />
              </button>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
