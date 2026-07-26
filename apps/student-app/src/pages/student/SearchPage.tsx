import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import { fetchFriendRequests, searchStudents, sendFriendRequest } from '../../lib/social';
import type { SearchResult } from '../../types/social';

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQ = searchParams.get('q') ?? '';
  const [query, setQuery] = useState(initialQ);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingOutgoing, setPendingOutgoing] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  // Keep input in sync when navigating from header search with ?q=
  useEffect(() => {
    const q = searchParams.get('q') ?? '';
    setQuery(q);
  }, [searchParams]);

  useEffect(() => {
    fetchFriendRequests()
      .then((data) => setPendingOutgoing(new Set(data.outgoing.map((r) => r.user.id))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError('');
        const data = await searchStudents(q);
        setResults(data);
        // Reflect in URL without stacking history for every keystroke
        setSearchParams(q ? { q } : {}, { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, setSearchParams]);

  async function handleAddFriend(userId: string) {
    try {
      setActionId(userId);
      setError('');
      await sendFriendRequest(userId);
      setPendingOutgoing((prev) => new Set(prev).add(userId));
      setResults((prev) =>
        prev.map((item) =>
          item.id === userId ? { ...item, friendshipStatus: 'pending_outgoing' } : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send request');
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl min-w-0 space-y-4">
      <Input
        label="Find classmates"
        placeholder="Name, reg no, department, year…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoComplete="off"
      />
      <p className="text-xs text-slate-400">Type at least 2 characters. Results come from live student accounts.</p>

      {error ? <p className="break-anywhere text-sm text-error">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Searching…</p> : null}

      {!loading && query.trim().length >= 2 && results.length === 0 ? (
        <p className="text-sm text-slate-500">No students found for “{query.trim()}”.</p>
      ) : null}

      <div className="space-y-3">
        {results.map((student) => {
          const isPending =
            student.friendshipStatus === 'pending_outgoing' || pendingOutgoing.has(student.id);
          const isFriend = student.friendshipStatus === 'friends';
          const isIncoming = student.friendshipStatus === 'pending_incoming';

          return (
            <div
              key={student.id}
              className="glass-card flex min-w-0 items-center gap-3 rounded-[24px] p-3 shadow-soft sm:p-4"
            >
              <Link to={`/home/user/${student.id}`} className="shrink-0">
                <StudentAvatar name={student.name} photoUrl={student.profilePhotoUrl} />
              </Link>
              <div className="min-w-0 flex-1">
                <Link
                  to={`/home/user/${student.id}`}
                  className="font-semibold text-slate-900 hover:text-primary break-anywhere"
                >
                  {student.name}
                </Link>
                <p className="text-xs text-slate-500 break-anywhere">
                  {student.regNo} · {student.department}
                  {student.year ? ` · Year ${student.year}` : ''}
                  {student.online ? ' · Online' : ''}
                </p>
              </div>
              {isFriend ? (
                <span className="shrink-0 text-xs font-medium text-success">Friends</span>
              ) : isPending ? (
                <span className="shrink-0 text-xs font-medium text-slate-400">Pending</span>
              ) : isIncoming ? (
                <Link
                  to="/home/friends"
                  className="shrink-0 rounded-full bg-primary/10 px-3 py-2 text-xs font-medium text-primary"
                >
                  Respond
                </Link>
              ) : (
                <Button
                  variant="secondary"
                  className="w-auto shrink-0 !min-h-10 px-3 py-2 text-xs"
                  loading={actionId === student.id}
                  onClick={() => void handleAddFriend(student.id)}
                >
                  Add friend
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
