import { Filter, Search, SlidersHorizontal, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MatchCard } from '../../components/skill-match/MatchCard';
import { Skeleton } from '../../components/ui/Skeleton';
import { connectSocket } from '../../lib/socket';
import {
  discoverSkillMatches,
  fetchSkillCatalog,
  fetchSkillRequests,
} from '../../lib/skill-match';
import type { SkillCatalog, SkillMatchCard } from '../../types/skill-match';

type SortKey = 'best' | 'relevant' | 'recent';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'best', label: 'Best Match' },
  { id: 'relevant', label: 'Most Relevant' },
  { id: 'recent', label: 'Recently Active' },
];

export function SkillMatchPage() {
  const [catalog, setCatalog] = useState<SkillCatalog | null>(null);
  const [items, setItems] = useState<SkillMatchCard[]>([]);
  const [incoming, setIncoming] = useState<SkillMatchCard[]>([]);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sort, setSort] = useState<SortKey>('best');
  const [filters, setFilters] = useState({
    skillId: '',
    categoryId: '',
    departmentId: '',
    year: '',
    goalId: '',
    availabilityId: '',
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [viewerReady, setViewerReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q.trim()), 320);
    return () => window.clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (mode: 'replace' | 'append' = 'replace') => {
      try {
        if (mode === 'replace') setLoading(true);
        else setLoadingMore(true);
        setError('');
        const data = await discoverSkillMatches({
          q: debouncedQ || undefined,
          skillId: filters.skillId || undefined,
          categoryId: filters.categoryId || undefined,
          departmentId: filters.departmentId || undefined,
          year: filters.year ? Number(filters.year) : undefined,
          goalId: filters.goalId || undefined,
          availabilityId: filters.availabilityId || undefined,
          sort,
          cursor: mode === 'append' ? cursor : undefined,
          limit: 12,
        });
        setItems((prev) => (mode === 'append' ? [...prev, ...data.items] : data.items));
        setCursor(data.nextCursor);
        setHasMore(data.hasMore);
        setViewerReady(data.viewerReady);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load Skill Match');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQ, filters, sort, cursor],
  );

  useEffect(() => {
    void fetchSkillCatalog().then(setCatalog).catch(() => undefined);
  }, []);

  useEffect(() => {
    setCursor(null);
    void load('replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when filters/search/sort change
  }, [debouncedQ, filters, sort]);

  useEffect(() => {
    void fetchSkillRequests()
      .then((d) => setIncoming(d.incoming))
      .catch(() => undefined);

    const socket = connectSocket();
    function refresh() {
      void fetchSkillRequests()
        .then((d) => setIncoming(d.incoming))
        .catch(() => undefined);
      void load('replace');
    }
    socket.on('skill-match:request', refresh);
    socket.on('skill-match:accept', refresh);
    socket.on('skill-match:decline', refresh);
    socket.on('skill-match:cancel', refresh);
    socket.on('friend:accept', refresh);
    return () => {
      socket.off('skill-match:request', refresh);
      socket.off('skill-match:accept', refresh);
      socket.off('skill-match:decline', refresh);
      socket.off('skill-match:cancel', refresh);
      socket.off('friend:accept', refresh);
    };
  }, [load]);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters],
  );

  function patchCard(next: SkillMatchCard) {
    setItems((prev) => prev.map((c) => (c.id === next.id ? next : c)));
    setIncoming((prev) =>
      next.connectionState === 'connected' || next.connectionState === 'connect'
        ? prev.filter((c) => c.id !== next.id)
        : prev.map((c) => (c.id === next.id ? next : c)),
    );
  }

  const skillOptions = useMemo(() => {
    if (!catalog) return [];
    if (filters.categoryId) {
      return catalog.categories.find((c) => c.id === filters.categoryId)?.skills ?? [];
    }
    return catalog.categories.flatMap((c) => c.skills);
  }, [catalog, filters.categoryId]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <header className="space-y-1">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
          <Zap size={13} aria-hidden /> Discover → Match → Connect
        </p>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-white">Skill Match</h1>
        <p className="text-sm text-zinc-400">Find students who complement your skills.</p>
      </header>

      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Search students, skills, or goals</span>
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, roll no, skill, goal…"
            className="min-h-11 w-full rounded-2xl border border-white/8 bg-zinc-900/80 py-2.5 pl-10 pr-3 text-sm text-white outline-none placeholder:text-zinc-500 focus:border-emerald-500/40 focus:ring-4 focus:ring-emerald-500/10"
          />
        </label>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-white/8 bg-zinc-900/80 text-zinc-300"
          aria-label="Open filters"
        >
          <SlidersHorizontal size={18} />
          {activeFilterCount ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          ) : null}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {SORTS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setSort(s.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              sort === s.id
                ? 'bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/30'
                : 'bg-white/5 text-zinc-400'
            }`}
          >
            {s.label}
          </button>
        ))}
        <Link
          to="/home/skill-match/me"
          className="ml-auto rounded-full bg-white/5 px-3 py-1.5 text-xs font-semibold text-emerald-300"
        >
          My profile
        </Link>
      </div>

      {!viewerReady ? (
        <Link
          to="/home/skill-match/me"
          className="block rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-100"
        >
          Complete your Skill Match profile to get better matches.
        </Link>
      ) : null}

      {incoming.length ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Requests received
          </h2>
          {incoming.map((card) => (
            <MatchCard key={card.id} card={card} onChange={patchCard} compact />
          ))}
        </section>
      ) : null}

      {error ? <p className="text-sm text-error">{error}</p> : null}

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Loading matches">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-[1.6rem] border border-white/8 bg-zinc-900/60 p-4">
              <div className="flex gap-3">
                <Skeleton className="h-16 w-16 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-28 rounded-full" />
                  <Skeleton className="h-4 w-40 rounded-full" />
                  <Skeleton className="h-3 w-48 rounded-full" />
                </div>
              </div>
              <Skeleton className="mt-4 h-16 w-full rounded-2xl" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[1.6rem] border border-white/8 bg-zinc-900/50 px-5 py-12 text-center">
          <Filter className="mx-auto text-zinc-600" size={28} />
          <p className="mt-3 font-semibold text-white">No matches yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            {viewerReady
              ? 'Try another search or filter. Only activated students with a Skill Match profile appear here.'
              : 'Add your skills and goals so we can find complementary classmates.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((card) => (
            <MatchCard key={card.id} card={card} onChange={patchCard} />
          ))}
          {hasMore ? (
            <button
              type="button"
              disabled={loadingMore}
              onClick={() => void load('append')}
              className="min-h-11 w-full rounded-2xl border border-white/8 text-sm font-semibold text-zinc-300"
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </button>
          ) : null}
        </div>
      )}

      {sheetOpen ? (
        <div className="fixed inset-0 z-50 lg:flex lg:items-start lg:justify-end" role="dialog" aria-modal="true" aria-label="Filters">
          <button
            type="button"
            className="absolute inset-0 bg-black/55"
            aria-label="Close filters"
            onClick={() => setSheetOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[1.6rem] border border-white/10 bg-zinc-950 p-5 pb-8 lg:inset-auto lg:right-0 lg:top-0 lg:h-full lg:w-[22rem] lg:rounded-none">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-white">Filters</h2>
              <button
                type="button"
                className="text-xs font-semibold text-emerald-300"
                onClick={() =>
                  setFilters({
                    skillId: '',
                    categoryId: '',
                    departmentId: '',
                    year: '',
                    goalId: '',
                    availabilityId: '',
                  })
                }
              >
                Clear
              </button>
            </div>
            <div className="space-y-3">
              <Select
                label="Category"
                value={filters.categoryId}
                onChange={(v) => setFilters((f) => ({ ...f, categoryId: v, skillId: '' }))}
                options={catalog?.categories.map((c) => ({ v: c.id, l: c.name })) ?? []}
              />
              <Select
                label="Skill"
                value={filters.skillId}
                onChange={(v) => setFilters((f) => ({ ...f, skillId: v }))}
                options={skillOptions.map((s) => ({ v: s.id, l: s.name }))}
              />
              <Select
                label="Department"
                value={filters.departmentId}
                onChange={(v) => setFilters((f) => ({ ...f, departmentId: v }))}
                options={catalog?.departments.map((d) => ({ v: d.id, l: d.name })) ?? []}
              />
              <Select
                label="Year"
                value={filters.year}
                onChange={(v) => setFilters((f) => ({ ...f, year: v }))}
                options={(catalog?.years ?? [1, 2, 3, 4]).map((y) => ({
                  v: String(y),
                  l: `${y}${y === 1 ? 'st' : y === 2 ? 'nd' : y === 3 ? 'rd' : 'th'} Year`,
                }))}
              />
              <Select
                label="I Want To"
                value={filters.goalId}
                onChange={(v) => setFilters((f) => ({ ...f, goalId: v }))}
                options={catalog?.goals.map((g) => ({ v: g.id, l: g.label })) ?? []}
              />
              <Select
                label="Available For"
                value={filters.availabilityId}
                onChange={(v) => setFilters((f) => ({ ...f, availabilityId: v }))}
                options={catalog?.availabilities.map((a) => ({ v: a.id, l: a.label })) ?? []}
              />
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="mt-5 min-h-11 w-full rounded-2xl bg-emerald-600 text-sm font-semibold text-white"
            >
              Show matches
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full rounded-2xl border border-white/8 bg-zinc-900 px-3 text-sm text-white"
      >
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </select>
    </label>
  );
}
