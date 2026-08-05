import { AnimatePresence, motion } from 'framer-motion';
import {
  Filter,
  Search,
  UsersRound,
  X,
  Check,
  Building2,
  Sparkles,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../../lib/config';
import {
  COMMUNITY_CATEGORIES,
  type Community,
  type CommunitySections,
  fetchCommunities,
  joinCommunity,
  leaveCommunity,
} from '../../lib/communities';

type SortMode = 'default' | 'members' | 'posts' | 'name';

export function CommunitiesPage() {
  const [items, setItems] = useState<Community[]>([]);
  const [sections, setSections] = useState<CommunitySections | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('ALL');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<SortMode>('default');
  const [showFilters, setShowFilters] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchCommunities({
        search: search.trim() || undefined,
        category: category === 'ALL' ? undefined : category,
        filter: filter || undefined,
        sort: sort === 'default' ? undefined : sort,
      });
      setItems(data.items);
      setSections(data.sections);
    } catch (err) {
      setItems([]);
      setSections(null);
      setError(err instanceof Error ? err.message : 'Failed to load communities');
    } finally {
      setLoading(false);
    }
  }, [search, category, filter, sort]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  async function toggleJoin(c: Community) {
    setBusyId(c.id);
    try {
      if (c.joined) {
        await leaveCommunity(c.id);
        flash('Left community');
      } else {
        await joinCommunity(c.id);
        flash('Joined community');
      }
      await load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  const hasSearchOrFilter = Boolean(search.trim() || (category !== 'ALL') || filter);

  const displaySections = useMemo(() => {
    if (!sections || hasSearchOrFilter) return null;
    return sections;
  }, [sections, hasSearchOrFilter]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
            Communities
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Discover clubs, departments, and campus groups
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white/80 px-3 text-xs font-semibold text-slate-600 shadow-soft dark:bg-slate-800 dark:text-slate-200"
          >
            <Filter size={14} /> Filters
          </button>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="h-10 rounded-full border-0 bg-white/80 px-3 text-xs font-semibold text-slate-600 shadow-soft outline-none dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="default">Sort: Featured</option>
            <option value="members">Sort: Members</option>
            <option value="posts">Sort: Posts</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>
      </header>

      <div className="glass-card flex items-center gap-2 rounded-[22px] px-4 py-2.5 shadow-soft">
        <Search size={16} className="shrink-0 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search communities…"
          className="min-h-9 w-full bg-transparent text-sm outline-none dark:text-white"
        />
        {search ? (
          <button type="button" onClick={() => setSearch('')} className="text-slate-400">
            <X size={16} />
          </button>
        ) : null}
      </div>

      {showFilters ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {COMMUNITY_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  category === c.id
                    ? 'bg-primary text-white shadow-float'
                    : 'bg-white/80 text-slate-600 shadow-soft dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: '', label: 'All' },
              { id: 'joined', label: 'Joined' },
              { id: 'featured', label: 'Featured' },
              { id: 'official', label: 'Official' },
              { id: 'department', label: 'My department' },
            ].map((f) => (
              <button
                key={f.id || 'all'}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  filter === f.id
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed left-1/2 top-20 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2 text-sm text-white shadow-float"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? (
        <p className="rounded-2xl bg-error/10 px-4 py-3 text-sm text-error">{error}</p>
      ) : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-52 animate-pulse rounded-[24px] bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : displaySections ? (
        <div className="space-y-8">
          <Section
            title="Joined"
            icon={<UserPlus size={16} />}
            items={displaySections.joined}
            busyId={busyId}
            onJoin={toggleJoin}
          />
          <Section
            title="Featured"
            icon={<Sparkles size={16} />}
            items={displaySections.featured}
            busyId={busyId}
            onJoin={toggleJoin}
          />
          <Section
            title="Trending"
            icon={<TrendingUp size={16} />}
            items={displaySections.trending}
            busyId={busyId}
            onJoin={toggleJoin}
          />
          <Section
            title="Department"
            icon={<Building2 size={16} />}
            items={displaySections.department}
            busyId={busyId}
            onJoin={toggleJoin}
          />
          <Section
            title="Official"
            icon={<UsersRound size={16} />}
            items={displaySections.official}
            busyId={busyId}
            onJoin={toggleJoin}
          />
          <Section
            title="Recommended"
            icon={<Sparkles size={16} />}
            items={displaySections.recommended}
            busyId={busyId}
            onJoin={toggleJoin}
          />
          {/* Fallback grid if all sections empty but items exist */}
          {Object.values(displaySections).every((s) => s.length === 0) ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((c) => (
                <CommunityCard key={c.id} community={c} busy={busyId === c.id} onJoin={() => void toggleJoin(c)} />
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <CommunityCard key={c.id} community={c} busy={busyId === c.id} onJoin={() => void toggleJoin(c)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  items,
  busyId,
  onJoin,
}: {
  title: string;
  icon: React.ReactNode;
  items: Community[];
  busyId: string | null;
  onJoin: (c: Community) => void;
}) {
  if (!items.length) return null;
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200">
        <span className="text-primary">{icon}</span>
        <h2 className="font-display text-sm font-bold uppercase tracking-wide">{title}</h2>
        <span className="text-xs text-slate-400">{items.length}</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <CommunityCard key={c.id} community={c} busy={busyId === c.id} onJoin={() => onJoin(c)} />
        ))}
      </div>
    </section>
  );
}

function CommunityCard({
  community: c,
  busy,
  onJoin,
}: {
  community: Community;
  busy: boolean;
  onJoin: () => void;
}) {
  const banner = resolveMediaUrl(c.bannerUrl);
  const icon = resolveMediaUrl(c.iconUrl);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card group flex flex-col overflow-hidden rounded-[24px] shadow-soft transition hover:shadow-float dark:bg-slate-900/50"
    >
      <div className="relative h-28 bg-gradient-to-br from-primary/30 via-blue-400/20 to-violet-400/30">
        {banner ? (
          <img src={banner} alt="" className="h-full w-full object-cover" />
        ) : null}
        <div className="absolute -bottom-6 left-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border-2 border-white bg-white shadow-soft dark:border-slate-800 dark:bg-slate-800">
            {icon ? (
              <img src={icon} alt="" className="h-full w-full object-cover" />
            ) : (
              <UsersRound className="text-primary" size={22} />
            )}
          </div>
        </div>
        <span className="absolute right-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">
          {c.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4 pt-8">
        <div className="mb-1 flex flex-wrap gap-1">
          {c.featured ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
              Featured
            </span>
          ) : null}
          {c.visibility === 'PRIVATE' ? (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              Private
            </span>
          ) : null}
          {c.status === 'ARCHIVED' ? (
            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500">
              Archived
            </span>
          ) : null}
        </div>
        <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">{c.name}</h3>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{c.description || 'No description'}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-400">
          <span>{c.memberCount} members</span>
          <span>·</span>
          <span>{c.postCount} posts</span>
          {c.department ? (
            <>
              <span>·</span>
              <span>{c.department}</span>
            </>
          ) : null}
        </div>
        {c.primaryModerator ? (
          <p className="mt-1 text-[11px] text-slate-400">Mod · {c.primaryModerator.name}</p>
        ) : null}

        <div className="mt-auto flex gap-2 pt-4">
          <Link
            to={`/home/communities/${c.id}`}
            className="flex-1 rounded-full bg-slate-100 py-2.5 text-center text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            View
          </Link>
          <button
            type="button"
            disabled={busy || c.status === 'ARCHIVED' || c.accessType === 'INVITE'}
            onClick={onJoin}
            className={`inline-flex flex-1 items-center justify-center gap-1 rounded-full py-2.5 text-xs font-semibold text-white transition disabled:opacity-50 ${
              c.joined
                ? 'bg-slate-500'
                : 'bg-gradient-to-r from-primary to-blue-600 shadow-float'
            }`}
          >
            {c.joined ? (
              <>
                <Check size={12} /> Joined
              </>
            ) : (
              'Join'
            )}
          </button>
        </div>
      </div>
    </motion.article>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/50 px-6 py-16 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <UsersRound size={28} />
      </div>
      <p className="font-semibold text-slate-800 dark:text-white">No communities yet</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
        When a Super Admin creates official clubs and groups, they will appear here. Nothing is demo data.
      </p>
    </div>
  );
}
