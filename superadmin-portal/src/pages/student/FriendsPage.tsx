import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import {
  acceptFriendRequest,
  fetchFriendRequests,
  fetchFriends,
  rejectFriendRequest,
} from '../../lib/social';
import type { FriendRequestItem, StudentSummary } from '../../types/social';

export function FriendsPage() {
  const [friends, setFriends] = useState<StudentSummary[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function load() {
    const [friendsData, requests] = await Promise.all([fetchFriends(), fetchFriendRequests()]);
    setFriends(friendsData);
    setIncoming(requests.incoming);
    setOutgoing(requests.outgoing);
  }

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load friends'))
      .finally(() => setLoading(false));
  }, []);

  async function handleAccept(requestId: string) {
    try {
      setActionId(requestId);
      await acceptFriendRequest(requestId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept request');
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(requestId: string) {
    try {
      setActionId(requestId);
      await rejectFriendRequest(requestId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject request');
    } finally {
      setActionId(null);
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
    <div className="space-y-6">
      {error ? <p className="text-sm text-error">{error}</p> : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Friend requests</h2>
        {incoming.length === 0 ? (
          <p className="text-sm text-slate-500">No incoming requests.</p>
        ) : (
          incoming.map((request) => (
            <div key={request.id} className="glass-card flex items-center gap-3 rounded-[24px] p-4 shadow-soft">
              <StudentAvatar name={request.user.name} photoUrl={request.user.profilePhotoUrl} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{request.user.name}</p>
                <p className="text-xs text-slate-500">{request.user.regNo}</p>
              </div>
              <div className="flex gap-2">
                <Button
                  className="!w-auto !min-h-10 !px-3 !py-2 !text-sm"
                  loading={actionId === request.id}
                  onClick={() => handleAccept(request.id)}
                >
                  Accept
                </Button>
                <Button
                  variant="ghost"
                  className="!w-auto !min-h-10 !px-3 !py-2 !text-sm"
                  onClick={() => handleReject(request.id)}
                >
                  Decline
                </Button>
              </div>
            </div>
          ))
        )}
      </section>

      {outgoing.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Sent requests</h2>
          {outgoing.map((request) => (
            <div key={request.id} className="glass-card flex items-center gap-3 rounded-[24px] p-4 shadow-soft">
              <StudentAvatar name={request.user.name} photoUrl={request.user.profilePhotoUrl} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{request.user.name}</p>
                <p className="text-xs text-slate-500">Pending</p>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Friends ({friends.length})</h2>
        {friends.length === 0 ? (
          <p className="text-sm text-slate-500">Find classmates from Search to connect.</p>
        ) : (
          friends.map((friend) => (
            <Link
              key={friend.id}
              to={`/home/user/${friend.id}`}
              className="glass-card flex items-center gap-3 rounded-[24px] p-4 shadow-soft transition hover:shadow-float"
            >
              <StudentAvatar name={friend.name} photoUrl={friend.profilePhotoUrl} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{friend.name}</p>
                <p className="text-xs text-slate-500">
                  {friend.regNo} · {friend.department}
                </p>
              </div>
            </Link>
          ))
        )}
      </section>
    </div>
  );
}