import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  fetchBlockedUsers,
  fetchFriendRequests,
  fetchFriends,
  rejectFriendRequest,
  unblockUser,
  unfriendUser,
} from '../../lib/social';
import { connectSocket } from '../../lib/socket';
import type { FriendRequestItem, StudentSummary } from '../../types/social';

export function FriendsPage() {
  const [friends, setFriends] = useState<StudentSummary[]>([]);
  const [incoming, setIncoming] = useState<FriendRequestItem[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequestItem[]>([]);
  const [blocked, setBlocked] = useState<
    Array<{ id: string; name: string; regNo: string; profilePhotoUrl: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    const [friendsData, requests, blockedData] = await Promise.all([
      fetchFriends(),
      fetchFriendRequests(),
      fetchBlockedUsers().catch(() => []),
    ]);
    setFriends(friendsData);
    setIncoming(requests.incoming);
    setOutgoing(requests.outgoing);
    setBlocked(blockedData);
  }, []);

  useEffect(() => {
    load()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load friends'))
      .finally(() => setLoading(false));

    const socket = connectSocket();
    function refresh() {
      void load().catch(() => undefined);
    }
    socket.on('friend:request', refresh);
    socket.on('friend:accept', refresh);
    socket.on('friend:reject', refresh);
    socket.on('friend:cancel', refresh);
    return () => {
      socket.off('friend:request', refresh);
      socket.off('friend:accept', refresh);
      socket.off('friend:reject', refresh);
      socket.off('friend:cancel', refresh);
    };
  }, [load]);

  async function handleAccept(requestId: string) {
    const row = incoming.find((r) => r.id === requestId);
    // Optimistic: move to friends list
    setIncoming((prev) => prev.filter((r) => r.id !== requestId));
    if (row) {
      setFriends((prev) =>
        prev.some((f) => f.id === row.user.id) ? prev : [row.user, ...prev],
      );
    }
    try {
      setActionId(requestId);
      setError('');
      await acceptFriendRequest(requestId);
      setToast('Friend request accepted');
      window.setTimeout(() => setToast(''), 2800);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept request');
      await load();
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(requestId: string) {
    setIncoming((prev) => prev.filter((r) => r.id !== requestId));
    try {
      setActionId(requestId);
      setError('');
      await rejectFriendRequest(requestId);
      setToast('Request declined');
      window.setTimeout(() => setToast(''), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject request');
      await load();
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
      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-[80] -translate-x-1/2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-float">
          {toast}
        </div>
      ) : null}
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
              <Button
                variant="ghost"
                className="!w-auto !min-h-10 !px-3 !py-2 !text-sm"
                loading={actionId === request.id}
                onClick={() => {
                  setActionId(request.id);
                  void cancelFriendRequest(request.id)
                    .then(() => load())
                    .catch((err) => setError(err instanceof Error ? err.message : 'Could not cancel'))
                    .finally(() => setActionId(null));
                }}
              >
                Cancel
              </Button>
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
            <div
              key={friend.id}
              className="glass-card flex items-center gap-3 rounded-[24px] p-4 shadow-soft"
            >
              <Link to={`/home/user/${friend.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <StudentAvatar name={friend.name} photoUrl={friend.profilePhotoUrl} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">{friend.name}</p>
                  <p className="text-xs text-slate-500">
                    {friend.regNo} · {friend.department}
                  </p>
                </div>
              </Link>
              <Button
                variant="ghost"
                className="!w-auto !min-h-10 !px-2 !py-2 !text-xs"
                loading={actionId === `u-${friend.id}`}
                onClick={() => {
                  setActionId(`u-${friend.id}`);
                  void unfriendUser(friend.id)
                    .then(() => load())
                    .catch((err) => setError(err instanceof Error ? err.message : 'Unfriend failed'))
                    .finally(() => setActionId(null));
                }}
              >
                Unfriend
              </Button>
              <Button
                variant="ghost"
                className="!w-auto !min-h-10 !px-2 !py-2 !text-xs !text-error"
                loading={actionId === `b-${friend.id}`}
                onClick={() => {
                  if (!window.confirm(`Block ${friend.name}?`)) return;
                  setActionId(`b-${friend.id}`);
                  void blockUser(friend.id)
                    .then(() => load())
                    .catch((err) => setError(err instanceof Error ? err.message : 'Block failed'))
                    .finally(() => setActionId(null));
                }}
              >
                Block
              </Button>
            </div>
          ))
        )}
      </section>

      {blocked.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">Blocked ({blocked.length})</h2>
          {blocked.map((user) => (
            <div
              key={user.id}
              className="glass-card flex items-center gap-3 rounded-[24px] p-4 shadow-soft"
            >
              <StudentAvatar name={user.name} photoUrl={user.profilePhotoUrl} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900">{user.name}</p>
                <p className="text-xs text-slate-500">{user.regNo}</p>
              </div>
              <Button
                variant="secondary"
                className="!w-auto !min-h-10 !px-3 !py-2 !text-sm"
                loading={actionId === `ub-${user.id}`}
                onClick={() => {
                  setActionId(`ub-${user.id}`);
                  void unblockUser(user.id)
                    .then(() => load())
                    .catch((err) => setError(err instanceof Error ? err.message : 'Unblock failed'))
                    .finally(() => setActionId(null));
                }}
              >
                Unblock
              </Button>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}