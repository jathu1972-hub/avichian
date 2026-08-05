import { motion, AnimatePresence } from 'framer-motion';
import {
  Bookmark,
  CalendarDays,
  Heart,
  MapPin,
  Search,
  Share2,
  Users,
  X,
  Clock,
  Building2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resolveMediaUrl } from '../../lib/config';
import {
  CATEGORY_CHIPS,
  type CampusEvent,
  type EventCategory,
  countdownLabel,
  fetchEventDetail,
  fetchEvents,
  formatEventWhen,
  joinEvent,
  leaveEvent,
  statusBadgeClass,
  toggleBookmark,
  toggleInterest,
} from '../../lib/events';

const FILTERS = [
  { id: '', label: 'All dates' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
];

export function EventsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<CampusEvent[]>([]);
  const [featured, setFeatured] = useState<CampusEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<EventCategory>('ALL');
  const [filter, setFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [detail, setDetail] = useState<CampusEvent | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEvents({
        search: search.trim() || undefined,
        category: category === 'ALL' ? undefined : category,
        filter: filter || undefined,
      });
      setItems(data.items);
      setFeatured(data.featured);
    } catch {
      setItems([]);
      setFeatured(null);
    } finally {
      setLoading(false);
    }
  }, [search, category, filter]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  async function openDetail(id: string) {
    setDetailLoading(true);
    try {
      const d = await fetchEventDetail(id);
      setDetail(d);
    } catch {
      flash('Could not load event');
    } finally {
      setDetailLoading(false);
    }
  }

  // Deep-link: /home/events?id=<eventId> opens detail from calendar / share links
  useEffect(() => {
    const id = searchParams.get('id');
    if (!id) return;
    void openDetail(id).then(() => {
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      setSearchParams(next, { replace: true });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open once from query
  }, []);

  async function onJoin(id: string, joined: boolean) {
    setBusyId(id);
    try {
      if (joined) await leaveEvent(id);
      else await joinEvent(id);
      flash(joined ? 'Left event' : 'Joined — registration confirmed');
      await load();
      if (detail?.id === id) await openDetail(id);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  async function onInterest(id: string) {
    try {
      const res = await toggleInterest(id);
      flash(res.data?.interested ? 'Marked interested' : 'Removed interest');
      await load();
      if (detail?.id === id) await openDetail(id);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function onBookmark(id: string) {
    try {
      const res = await toggleBookmark(id);
      flash(res.data?.bookmarked ? 'Bookmarked' : 'Bookmark removed');
      await load();
      if (detail?.id === id) await openDetail(id);
    } catch (e) {
      flash(e instanceof Error ? e.message : 'Failed');
    }
  }

  function shareEvent(ev: CampusEvent) {
    const url = `${window.location.origin}/home/events?id=${ev.id}`;
    if (navigator.share) {
      void navigator.share({ title: ev.title, text: ev.description, url });
    } else {
      void navigator.clipboard.writeText(url);
      flash('Link copied');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Events
          </h1>
          <p className="text-sm text-slate-500">Campus life · real-time from PostgreSQL</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="rounded-full border border-white/40 bg-white/70 px-4 py-2 text-xs font-semibold shadow-soft backdrop-blur"
          >
            Filters
          </button>
          <Link
            to="/home/calendar"
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white shadow-float"
          >
            <CalendarDays size={14} /> Calendar
          </Link>
        </div>
      </header>

      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, organizer, venue, department…"
          className="w-full rounded-[22px] border border-white/50 bg-white/75 py-3.5 pl-11 pr-4 text-sm shadow-soft backdrop-blur outline-none ring-primary/20 focus:ring-2"
        />
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
        {CATEGORY_CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${
              category === c.id
                ? 'bg-slate-900 text-white shadow-float'
                : 'bg-white/70 text-slate-600 shadow-soft backdrop-blur hover:bg-white'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <AnimatePresence>
        {showFilters ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-wrap gap-2 overflow-hidden"
          >
            {FILTERS.map((f) => (
              <button
                key={f.id || 'all'}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  filter === f.id ? 'bg-primary/15 text-primary' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {f.label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {toast ? (
        <div className="rounded-2xl bg-slate-900 px-4 py-2 text-center text-sm text-white shadow-float">
          {toast}
        </div>
      ) : null}

      {loading ? (
        <div className="space-y-4">
          <div className="h-52 animate-pulse rounded-[28px] bg-slate-200/60" />
          <div className="h-36 animate-pulse rounded-[28px] bg-slate-200/60" />
        </div>
      ) : (
        <>
          {featured ? (
            <motion.article
              layout
              className="relative overflow-hidden rounded-[28px] shadow-float"
            >
              <div className="absolute inset-0">
                {featured.bannerUrl ? (
                  <img
                    src={resolveMediaUrl(featured.bannerUrl) ?? featured.bannerUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-primary via-indigo-600 to-violet-700" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/10" />
              </div>
              <div className="relative flex min-h-[220px] flex-col justify-end p-5 sm:p-7">
                <div className="mb-2 flex flex-wrap gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(featured.status)}`}>
                    {featured.status}
                  </span>
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-white backdrop-blur">
                    {featured.category}
                  </span>
                  {featured.countdownMs > 0 && featured.status === 'UPCOMING' ? (
                    <span className="rounded-full bg-amber-400/90 px-2.5 py-0.5 text-[10px] font-bold text-slate-900">
                      {countdownLabel(featured.countdownMs)}
                    </span>
                  ) : null}
                </div>
                <h2 className="font-display text-2xl font-bold text-white sm:text-3xl">
                  {featured.title}
                </h2>
                <p className="mt-1 text-sm text-white/80">
                  {featured.organizer ?? 'Campus'}
                  {featured.department ? ` · ${featured.department}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/90">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} /> {formatEventWhen(featured.startsAt).date} ·{' '}
                    {formatEventWhen(featured.startsAt).time}
                  </span>
                  {featured.venue ? (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={12} /> {featured.venue}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1">
                    <Heart size={12} /> {featured.interestedCount} interested
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users size={12} /> {featured.registeredCount} joined
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === featured.id}
                    onClick={() => onJoin(featured.id, featured.joined)}
                    className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-float"
                  >
                    {featured.joined ? 'Leave event' : 'Join event'}
                  </button>
                  <button
                    type="button"
                    onClick={() => openDetail(featured.id)}
                    className="rounded-full border border-white/40 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur"
                  >
                    View details
                  </button>
                </div>
              </div>
            </motion.article>
          ) : null}

          {items.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/50 px-6 py-16 text-center text-slate-400 backdrop-blur">
              No events match your filters. Super Admin can publish new events.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {items.map((ev) => {
                const when = formatEventWhen(ev.startsAt);
                return (
                  <motion.article
                    key={ev.id}
                    layout
                    className="glass-card flex flex-col overflow-hidden rounded-[26px] shadow-soft"
                  >
                    <div className="relative h-36 bg-gradient-to-br from-slate-200 to-slate-300">
                      {ev.bannerUrl ? (
                        <img
                          src={resolveMediaUrl(ev.bannerUrl) ?? ev.bannerUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : null}
                      <span
                        className={`absolute left-3 top-3 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(ev.status)}`}
                      >
                        {ev.status}
                      </span>
                      <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-0.5 text-[10px] font-bold uppercase text-white backdrop-blur">
                        {ev.category}
                      </span>
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <h3 className="font-semibold text-slate-900">{ev.title}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-slate-500">{ev.description || '—'}</p>
                      <div className="mt-3 space-y-1 text-xs text-slate-500">
                        <p className="inline-flex items-center gap-1">
                          <Building2 size={12} /> {ev.organizer ?? 'Organizer TBA'}
                          {ev.department ? ` · ${ev.department}` : ''}
                        </p>
                        <p className="inline-flex items-center gap-1">
                          <Clock size={12} /> {when.date} · {when.time}
                        </p>
                        {ev.venue ? (
                          <p className="inline-flex items-center gap-1">
                            <MapPin size={12} /> {ev.venue}
                          </p>
                        ) : null}
                        {ev.remainingSeats != null ? (
                          <p className="text-amber-700">{ev.remainingSeats} seats left</p>
                        ) : null}
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busyId === ev.id}
                          onClick={() => onJoin(ev.id, ev.joined)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                            ev.joined
                              ? 'bg-emerald-500/15 text-emerald-700'
                              : 'bg-primary text-white'
                          }`}
                        >
                          {ev.joined ? 'Joined' : 'Join'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onInterest(ev.id)}
                          className={`rounded-full p-1.5 ${ev.interested ? 'text-rose-500' : 'text-slate-400'}`}
                          aria-label="Interested"
                        >
                          <Heart size={16} fill={ev.interested ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onBookmark(ev.id)}
                          className={`rounded-full p-1.5 ${ev.bookmarked ? 'text-primary' : 'text-slate-400'}`}
                          aria-label="Bookmark"
                        >
                          <Bookmark size={16} fill={ev.bookmarked ? 'currentColor' : 'none'} />
                        </button>
                        <button
                          type="button"
                          onClick={() => shareEvent(ev)}
                          className="rounded-full p-1.5 text-slate-400"
                          aria-label="Share"
                        >
                          <Share2 size={16} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openDetail(ev.id)}
                          className="ml-auto rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700"
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  </motion.article>
                );
              })}
            </div>
          )}
        </>
      )}

      <AnimatePresence>
        {(detail || detailLoading) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={() => setDetail(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]"
            >
              {detailLoading || !detail ? (
                <div className="h-64 animate-pulse bg-slate-100" />
              ) : (
                <>
                  <div className="relative h-44 bg-gradient-to-br from-primary to-violet-700">
                    {detail.bannerUrl ? (
                      <img
                        src={resolveMediaUrl(detail.bannerUrl) ?? detail.bannerUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setDetail(null)}
                      className="absolute right-3 top-3 rounded-full bg-black/40 p-2 text-white"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="space-y-4 p-5">
                    <div className="flex flex-wrap gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(detail.status)}`}>
                        {detail.status}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                        {detail.category}
                      </span>
                    </div>
                    <h2 className="font-display text-2xl font-bold text-slate-900">{detail.title}</h2>
                    <p className="text-sm text-slate-600">{detail.description || 'No description.'}</p>
                    <dl className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <dt className="text-slate-400">Organizer</dt>
                        <dd className="font-medium">{detail.organizer ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Speaker</dt>
                        <dd className="font-medium">{detail.speaker ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">When</dt>
                        <dd className="font-medium">
                          {formatEventWhen(detail.startsAt).date}
                          <br />
                          {formatEventWhen(detail.startsAt).time}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-slate-400">Venue</dt>
                        <dd className="font-medium">{detail.venue ?? 'TBA'}</dd>
                      </div>
                    </dl>

                    {Array.isArray(detail.schedule) && detail.schedule.length > 0 ? (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold">Schedule</h3>
                        <ul className="space-y-2 border-l-2 border-primary/30 pl-3">
                          {(detail.schedule as { time?: string; title?: string }[]).map((s, i) => (
                            <li key={i} className="text-xs text-slate-600">
                              <span className="font-semibold text-primary">{s.time ?? ''}</span>{' '}
                              {s.title ?? ''}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {detail.participants && detail.participants.length > 0 ? (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold">
                          Participants ({detail.registeredCount})
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {detail.participants.slice(0, 12).map((p) => (
                            <span
                              key={p.id}
                              className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                            >
                              {p.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {detail.interestedStudents && detail.interestedStudents.length > 0 ? (
                      <div>
                        <h3 className="mb-2 text-sm font-semibold">Interested</h3>
                        <div className="flex flex-wrap gap-2">
                          {detail.interestedStudents.slice(0, 12).map((p) => (
                            <span
                              key={p.id}
                              className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700"
                            >
                              {p.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        disabled={busyId === detail.id}
                        onClick={() => onJoin(detail.id, detail.joined)}
                        className="flex-1 rounded-full bg-primary py-3 text-sm font-semibold text-white"
                      >
                        {detail.joined ? 'Leave event' : 'Join event'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onInterest(detail.id)}
                        className="rounded-full bg-rose-50 px-4 py-3 text-rose-600"
                      >
                        <Heart size={18} fill={detail.interested ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        onClick={() => shareEvent(detail)}
                        className="rounded-full bg-slate-100 px-4 py-3 text-slate-600"
                      >
                        <Share2 size={18} />
                      </button>
                      <a
                        href={`data:text/calendar;charset=utf-8,${encodeURIComponent(buildIcs(detail))}`}
                        download={`${detail.title.replace(/\s+/g, '-')}.ics`}
                        className="rounded-full bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-700"
                      >
                        Add to calendar
                      </a>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function buildIcs(ev: CampusEvent) {
  const start = new Date(ev.startsAt);
  const end = ev.endsAt ? new Date(ev.endsAt) : new Date(start.getTime() + 2 * 3600000);
  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${ev.title}`,
    `DESCRIPTION:${(ev.description || '').replace(/\n/g, '\\n')}`,
    `LOCATION:${ev.venue || ''}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
