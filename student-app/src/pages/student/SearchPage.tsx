import {
  BadgeCheck,
  Calendar,
  Filter,
  MessageCircle,
  Search as SearchIcon,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import {
  acceptFriendByUserId,
  openChatWithPeer,
  sendFriendRequest,
  unifiedSearch,
} from '../../lib/social';
import type { SearchResult } from '../../types/social';

type Tab = 'students' | 'communities' | 'events';

export function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [tab, setTab] = useState<Tab>(
    (searchParams.get('type') as Tab) === 'communities' ||
      (searchParams.get('type') as Tab) === 'events'
      ? (searchParams.get('type') as Tab)
      : 'students',
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState('');
  const [friendsOnly, setFriendsOnly] = useState(false);
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [students, setStudents] = useState<SearchResult[]>([]);
  const [communities, setCommunities] = useState<
    Array<{ id: string; name: string; description: string; memberCount: number }>
  >([]);
  const [events, setEvents] = useState<
    Array<{ id: string; title: string; startsAt: string; venue: string | null }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    setQuery(searchParams.get('q') ?? '');
  }, [searchParams]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setLoading(true);
        setError('');
        const data = await unifiedSearch({
          q: query.trim(),
          type: tab === 'students' ? 'students' : tab,
          department: department.trim() || undefined,
          year: year ? Number(year) : undefined,
          sort: onlineOnly ? 'active' : 'az',
          friendsOnly,
          onlineOnly,
        });
        setStudents(data.students ?? []);
        setCommunities(data.communities ?? []);
        setEvents(data.events ?? []);
        const next: Record<string, string> = { type: tab };
        if (query.trim()) next.q = query.trim();
        setSearchParams(next, { replace: true });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setStudents([]);
        setCommunities([]);
        setEvents([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, tab, department, year, friendsOnly, onlineOnly, setSearchParams]);

  async function handleAddFriend(userId: string) {
    try {
      setActionId(userId);
      await sendFriendRequest(userId);
      setStudents((prev) =>
        prev.map((s) =>
          s.id === userId ? { ...s, friendshipStatus: 'pending_outgoing' } : s,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setActionId(null);
    }
  }

  async function handleAccept(userId: string) {
    try {
      setActionId(userId);
      await acceptFriendByUserId(userId);
      setStudents((prev) =>
        prev.map((s) => (s.id === userId ? { ...s, friendshipStatus: 'friends' } : s)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Accept failed');
    } finally {
      setActionId(null);
    }
  }

  async function handleMessage(userId: string) {
    try {
      setActionId(userId);
      const chat = await openChatWithPeer(userId);
      navigate(`/home/chat/${chat.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Friends only');
    } finally {
      setActionId(null);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'students', label: 'Students' },
    { id: 'communities', label: 'Communities' },
    { id: 'events', label: 'Events' },
  ];

  return (
    <div className="mx-auto w-full max-w-lg space-y-5 pb-8">
      <div className="px-0.5">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary/80">Discover</p>
        <h1 className="font-display text-fluid-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Search
        </h1>
      </div>

      {/* Floating search bar */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <SearchIcon
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, communities, events…"
            autoComplete="off"
            className="min-h-12 w-full rounded-full border border-slate-200 bg-white/90 py-3 pl-11 pr-10 text-sm font-medium text-slate-900 shadow-soft outline-none transition placeholder:text-slate-500 focus:border-primary focus:ring-4 focus:ring-primary/12 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-50 dark:placeholder:text-zinc-400"
          />
          {query ? (
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-200 dark:hover:bg-zinc-700"
              onClick={() => setQuery('')}
              aria-label="Clear"
            >
              <X size={16} />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-soft transition ${
            filtersOpen || department || year
              ? 'bg-gradient-to-br from-primary to-secondary text-white'
              : 'bg-white/90 text-slate-600 ring-1 ring-slate-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-700'
          }`}
          aria-label="Filters"
        >
          <Filter size={18} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-full bg-white/80 p-1 shadow-soft ring-1 ring-slate-100 dark:bg-zinc-900/80 dark:ring-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-10 flex-1 rounded-full text-xs font-bold transition sm:text-sm ${
              tab === t.id
                ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-float'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {filtersOpen ? (
        <div className="space-y-3 rounded-[1.5rem] glass-elevated p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-semibold text-slate-500">
              Department
              <input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="Any"
                className="mt-1.5 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </label>
            <label className="text-xs font-semibold text-slate-500">
              Year
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="mt-1.5 min-h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <option value="">Any</option>
                {[1, 2, 3, 4].map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="chip-pill cursor-pointer">
              <input
                type="checkbox"
                className="mr-1.5"
                checked={friendsOnly}
                onChange={(e) => setFriendsOnly(e.target.checked)}
              />
              Friends only
            </label>
            <label className="chip-pill cursor-pointer">
              <input
                type="checkbox"
                className="mr-1.5"
                checked={onlineOnly}
                onChange={(e) => setOnlineOnly(e.target.checked)}
              />
              Online
            </label>
          </div>
          <p className="text-[11px] text-slate-400">
            Only students who have logged into AVICHIAN appear in search.
          </p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-error">{error}</p> : null}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="flex animate-pulse items-center gap-3 rounded-[24px] bg-slate-100/80 p-4 dark:bg-slate-800/50"
            >
              <div className="h-14 w-14 rounded-full bg-slate-200 dark:bg-slate-700" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3.5 w-1/2 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="h-3 w-2/3 rounded-full bg-slate-200/80 dark:bg-slate-700/80" />
              </div>
              <div className="h-9 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>
          ))}
        </div>
      ) : null}

      {!loading && tab === 'students' ? (
        <div className="space-y-2.5">
          {students.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">
              {query.trim() ? `No students match “${query.trim()}”` : 'Start typing a name or reg no'}
            </p>
          ) : (
            students.map((s) => {
              const friendLabel =
                s.friendshipStatus === 'friends'
                  ? 'Friends'
                  : s.friendshipStatus === 'pending_outgoing'
                    ? 'Request sent'
                    : s.friendshipStatus === 'pending_incoming'
                      ? 'Responds to you'
                      : 'Not friends';
              return (
              <div
                key={s.id}
                className="premium-card flex flex-col gap-3 p-3.5 transition hover:scale-[1.01] sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <Link to={`/home/user/${s.id}`} className="relative shrink-0">
                    <StudentAvatar name={s.name} photoUrl={s.profilePhotoUrl} size="md" />
                    {s.online ? (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-success dark:border-zinc-900" />
                    ) : null}
                  </Link>
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/home/user/${s.id}`}
                      className="flex items-center gap-1 truncate font-bold text-slate-900 dark:text-white"
                    >
                      {s.name}
                      {s.verifiedBadge ? (
                        <BadgeCheck size={14} className="shrink-0 text-primary" aria-label="Verified" />
                      ) : null}
                    </Link>
                    <p className="truncate text-xs font-medium text-slate-500 dark:text-zinc-400">
                      {s.department}
                      {s.year ? ` · Year ${s.year}` : ''}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-zinc-400">
                      {s.online ? 'Online' : 'Offline'} · {friendLabel}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5">
                  <Link
                    to={`/home/user/${s.id}`}
                    className="inline-flex min-h-10 items-center rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-700 dark:bg-zinc-800 dark:text-zinc-200"
                  >
                    View Profile
                  </Link>
                  {s.friendshipStatus === 'friends' ? (
                    <Button
                      variant="secondary"
                      className="!min-h-10 w-auto rounded-full px-3.5 text-xs"
                      loading={actionId === s.id}
                      onClick={() => void handleMessage(s.id)}
                    >
                      <MessageCircle size={14} className="mr-1" /> Message
                    </Button>
                  ) : s.friendshipStatus === 'pending_outgoing' ? (
                    <span className="inline-flex min-h-10 items-center rounded-full bg-slate-100 px-3 text-xs font-medium text-slate-500 dark:bg-zinc-800 dark:text-zinc-400">
                      Requested
                    </span>
                  ) : s.friendshipStatus === 'pending_incoming' ? (
                    <Button
                      className="!min-h-10 w-auto rounded-full px-3.5 text-xs"
                      loading={actionId === s.id}
                      onClick={() => void handleAccept(s.id)}
                    >
                      Accept
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      className="!min-h-10 w-auto rounded-full px-3.5 text-xs"
                      loading={actionId === s.id}
                      onClick={() => void handleAddFriend(s.id)}
                    >
                      <Users size={14} className="mr-1" /> Add Friend
                    </Button>
                  )}
                </div>
              </div>
              );
            })
          )}
        </div>
      ) : null}

      {!loading && tab === 'communities' ? (
        <div className="space-y-2.5">
          {communities.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">No communities found</p>
          ) : (
            communities.map((c) => (
              <Link
                key={c.id}
                to={`/home/communities/${c.id}`}
                className="flex items-center gap-3 rounded-[24px] bg-white/90 p-3.5 shadow-soft ring-1 ring-slate-100 dark:bg-slate-900/70 dark:ring-slate-800"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <UsersRound size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white">{c.name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {c.memberCount} members
                    {c.description ? ` · ${c.description}` : ''}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      ) : null}

      {!loading && tab === 'events' ? (
        <div className="space-y-2.5">
          {events.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">No events found</p>
          ) : (
            events.map((e) => (
              <Link
                key={e.id}
                to="/home/events"
                className="flex items-center gap-3 rounded-[24px] bg-white/90 p-3.5 shadow-soft ring-1 ring-slate-100 dark:bg-slate-900/70 dark:ring-slate-800"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
                  <Calendar size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 dark:text-white">{e.title}</p>
                  <p className="truncate text-xs text-slate-500">
                    {new Date(e.startsAt).toLocaleString()}
                    {e.venue ? ` · ${e.venue}` : ''}
                  </p>
                </div>
              </Link>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
