import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import { fetchFriendRequests, searchStudents, sendFriendRequest } from '../../lib/social';
import type { SearchResult } from '../../types/social';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [pendingOutgoing, setPendingOutgoing] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    fetchFriendRequests()
      .then((data) => setPendingOutgoing(new Set(data.outgoing.map((r) => r.user.id))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError('');
        const data = await searchStudents(query.trim());
        setResults(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query]);

  async function handleAddFriend(userId: string) {
    try {
      setActionId(userId);
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
    <div className="space-y-4">
      <Input
        label="Find students"
        placeholder="Search by name or reg no"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {error ? <p className="text-sm text-error">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Searching…</p> : null}

      <div className="space-y-3">
        {results.map((student) => {
          const isPending =
            student.friendshipStatus === 'pending_outgoing' || pendingOutgoing.has(student.id);
          const isFriend = student.friendshipStatus === 'friends';

          return (
            <div key={student.id} className="glass-card flex items-center gap-3 rounded-[24px] p-4 shadow-soft">
              <Link to={`/home/user/${student.id}`}>
                <StudentAvatar name={student.name} photoUrl={student.profilePhotoUrl} />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/home/user/${student.id}`} className="font-semibold text-slate-900 hover:text-primary">
                  {student.name}
                </Link>
                <p className="text-xs text-slate-500">
                  {student.regNo} · {student.department}
                </p>
              </div>
              {isFriend ? (
                <span className="text-xs font-medium text-success">Friends</span>
              ) : isPending ? (
                <span className="text-xs font-medium text-slate-400">Pending</span>
              ) : (
                <Button
                  variant="secondary"
                  className="!w-auto !min-h-10 !px-4 !py-2 !text-sm"
                  loading={actionId === student.id}
                  onClick={() => handleAddFriend(student.id)}
                >
                  Add
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {query.trim().length >= 2 && !loading && results.length === 0 ? (
        <p className="text-center text-sm text-slate-500">No students found.</p>
      ) : null}
    </div>
  );
}