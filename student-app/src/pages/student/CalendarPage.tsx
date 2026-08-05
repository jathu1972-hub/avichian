import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  MapPin,
  Plus,
  Search,
  Share2,
  Trash2,
  Users,
  X,
  Clock,
  Building2,
  ExternalLink,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../../lib/config';
import {
  type CalendarItem,
  type CampusEvent,
  PERSONAL_TYPES,
  REMINDER_OPTIONS,
  createPersonalEvent,
  deletePersonalEvent,
  fetchCalendar,
  fetchEventDetail,
  formatEventWhen,
  itemDateKey,
  joinEvent,
  leaveEvent,
  localDateKey,
  statusBadgeClass,
} from '../../lib/events';

type ViewMode = 'month' | 'week' | 'day' | 'agenda';

const LEGEND = [
  { color: '#2563EB', label: 'College' },
  { color: '#8B5CF6', label: 'Department' },
  { color: '#22C55E', label: 'Personal' },
  { color: '#F97316', label: 'Exams' },
  { color: '#EF4444', label: 'Deadlines' },
  { color: '#EAB308', label: 'Holidays' },
];

const FILTER_CATS = [
  { id: 'all', label: 'All' },
  { id: 'campus', label: 'Campus' },
  { id: 'personal', label: 'Personal' },
  { id: 'COLLEGE', label: 'College' },
  { id: 'DEPARTMENT', label: 'Dept' },
  { id: 'EXAMS', label: 'Exams' },
  { id: 'WORKSHOPS', label: 'Workshops' },
  { id: 'ASSIGNMENT', label: 'Assignments' },
];

export function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<ViewMode>('month');
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(() => localDateKey());
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [filterCat, setFilterCat] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showPersonal, setShowPersonal] = useState(false);
  const [detailCampus, setDetailCampus] = useState<CampusEvent | null>(null);
  const [detailItem, setDetailItem] = useState<CalendarItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [personalForm, setPersonalForm] = useState({
    title: '',
    description: '',
    type: 'REMINDER',
    startsAt: '',
    endsAt: '',
    reminderOffset: 'none',
  });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const range = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    if (view === 'day') {
      const d = new Date(y, m, cursor.getDate());
      const start = new Date(d);
      start.setHours(0, 0, 0, 0);
      const end = new Date(d);
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end };
    }
    if (view === 'week') {
      const day = cursor.getDay();
      const start = new Date(y, m, cursor.getDate() - day);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { from: start, to: end };
    }
    // month + agenda: pad month with adjacent weeks for grid
    const from = new Date(y, m, 1);
    from.setDate(from.getDate() - 7);
    const to = new Date(y, m + 1, 7, 23, 59, 59);
    return { from, to };
  }, [cursor, view]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchCalendar(range.from.toISOString(), range.to.toISOString());
      setItems(data.items ?? []);
      setUpcoming(data.upcoming ?? data.items?.filter((i) => new Date(i.start) >= new Date()).slice(0, 12) ?? []);
    } catch {
      setItems([]);
      setUpcoming([]);
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((e) => {
      if (filterCat === 'campus' && e.type === 'personal') return false;
      if (filterCat === 'personal' && e.type !== 'personal') return false;
      if (
        filterCat !== 'all' &&
        filterCat !== 'campus' &&
        filterCat !== 'personal' &&
        e.category !== filterCat
      ) {
        return false;
      }
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        (e.organizer || '').toLowerCase().includes(q) ||
        (e.venue || '').toLowerCase().includes(q) ||
        (e.department || '').toLowerCase().includes(q) ||
        e.start.slice(0, 10).includes(q)
      );
    });
  }, [items, search, filterCat]);

  const monthCells = useMemo(() => {
    const y = cursor.getFullYear();
    const m = cursor.getMonth();
    const first = new Date(y, m, 1).getDay();
    const count = new Date(y, m + 1, 0).getDate();
    const cells: { day: number | null; key: string | null }[] = [];
    for (let i = 0; i < first; i++) cells.push({ day: null, key: null });
    for (let d = 1; d <= count; d++) {
      const key = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({ day: d, key });
    }
    return cells;
  }, [cursor]);

  const weekDays = useMemo(() => {
    const day = cursor.getDay();
    const start = new Date(cursor);
    start.setDate(cursor.getDate() - day);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { date: d, key: localDateKey(d) };
    });
  }, [cursor]);

  function eventsOn(key: string | null) {
    if (!key) return [];
    return filtered.filter((e) => itemDateKey(e.start) === key);
  }

  function flash(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  function goToday() {
    const n = new Date();
    setCursor(n);
    setSelectedDay(localDateKey(n));
  }

  function shift(dir: -1 | 1) {
    const n = new Date(cursor);
    if (view === 'day') n.setDate(n.getDate() + dir);
    else if (view === 'week') n.setDate(n.getDate() + dir * 7);
    else n.setMonth(n.getMonth() + dir);
    setCursor(n);
  }

  async function savePersonal(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!personalForm.title.trim()) {
      setFormError('Title is required');
      return;
    }
    if (!personalForm.startsAt) {
      setFormError('Date and time are required');
      return;
    }
    setSaving(true);
    try {
      await createPersonalEvent({
        title: personalForm.title.trim(),
        description: personalForm.description.trim() || undefined,
        type: personalForm.type,
        startsAt: new Date(personalForm.startsAt).toISOString(),
        endsAt: personalForm.endsAt
          ? new Date(personalForm.endsAt).toISOString()
          : undefined,
        reminderOffset:
          personalForm.reminderOffset === 'none' ? null : personalForm.reminderOffset,
      });
      setShowPersonal(false);
      setPersonalForm({
        title: '',
        description: '',
        type: 'REMINDER',
        startsAt: '',
        endsAt: '',
        reminderOffset: 'none',
      });
      flash('Personal event saved');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function removePersonal(id: string) {
    if (!window.confirm('Delete this personal event?')) return;
    try {
      await deletePersonalEvent(id);
      flash('Deleted');
      setDetailItem(null);
      await load();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  async function openItem(item: CalendarItem) {
    setDetailItem(item);
    if (item.type === 'campus') {
      setDetailLoading(true);
      try {
        const d = await fetchEventDetail(item.id);
        setDetailCampus(d);
      } catch {
        setDetailCampus(null);
      } finally {
        setDetailLoading(false);
      }
    } else {
      setDetailCampus(null);
    }
  }

  async function toggleJoin(id: string, joined: boolean) {
    setBusyId(id);
    try {
      if (joined) await leaveEvent(id);
      else await joinEvent(id);
      const d = await fetchEventDetail(id);
      setDetailCampus(d);
      await load();
      flash(joined ? 'Left event' : 'Joined event');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  function shareItem(item: CalendarItem) {
    const url =
      item.type === 'campus'
        ? `${window.location.origin}/home/events?id=${item.id}`
        : window.location.href;
    if (navigator.share) {
      void navigator.share({ title: item.title, url }).catch(() => undefined);
    } else {
      void navigator.clipboard.writeText(url).then(() => flash('Link copied'));
    }
  }

  const dayEvents = selectedDay ? eventsOn(selectedDay) : [];
  const todayKey = localDateKey();
  const agendaItems = [...filtered].sort((a, b) => a.start.localeCompare(b.start));
  const headerLabel = cursor.toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
    ...(view === 'day' ? { day: 'numeric', weekday: 'short' } : {}),
  });

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-10">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
            Event Calendar
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            College · department · personal · reminders
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowSearch((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-600 shadow-soft backdrop-blur dark:bg-slate-800 dark:text-slate-200"
            aria-label="Search"
          >
            <Search size={18} />
          </button>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-slate-600 shadow-soft dark:bg-slate-800 dark:text-slate-200"
            aria-label="Filter"
          >
            <Filter size={18} />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-full bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => setShowPersonal(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-2 text-xs font-semibold text-white shadow-float"
          >
            <Plus size={14} /> Add event
          </button>
          <Link
            to="/home/events"
            className="rounded-full bg-white/80 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-soft dark:bg-slate-800 dark:text-slate-200"
          >
            All events
          </Link>
        </div>
      </header>

      {showSearch ? (
        <div className="glass-card flex items-center gap-2 rounded-[22px] px-4 py-2 shadow-soft">
          <Search size={16} className="text-slate-400" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, organizer, venue, date…"
            className="min-h-10 w-full bg-transparent text-sm outline-none dark:text-white"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} className="text-slate-400">
              <X size={16} />
            </button>
          ) : null}
        </div>
      ) : null}

      {showFilters ? (
        <div className="flex flex-wrap gap-1.5">
          {FILTER_CATS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFilterCat(c.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                filterCat === c.id
                  ? 'bg-primary text-white shadow-float'
                  : 'bg-white/80 text-slate-600 shadow-soft dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : null}

      {/* Nav + view switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-soft dark:bg-slate-800"
            aria-label="Previous"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-soft dark:bg-slate-800"
            aria-label="Next"
          >
            <ChevronRight size={18} />
          </button>
          <span className="ml-2 min-w-[10rem] font-display text-sm font-semibold text-slate-800 dark:text-white sm:text-base">
            {headerLabel}
          </span>
        </div>
        <div className="flex rounded-full bg-slate-100/90 p-0.5 text-xs font-semibold dark:bg-slate-800">
          {(['month', 'week', 'day', 'agenda'] as ViewMode[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-full px-3 py-1.5 capitalize transition ${
                view === v
                  ? 'bg-white text-slate-900 shadow-soft dark:bg-slate-700 dark:text-white'
                  : 'text-slate-500'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[10px] font-medium text-slate-500">
        {LEGEND.map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
      </div>

      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed left-1/2 top-20 z-[60] -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2.5 text-sm text-white shadow-float"
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        {/* Main calendar */}
        <div className="min-w-0 space-y-4">
          {loading ? (
            <div className="h-80 animate-pulse rounded-[28px] bg-slate-100 dark:bg-slate-800" />
          ) : view === 'month' ? (
            <div className="glass-card rounded-[28px] p-3 shadow-soft sm:p-4 dark:bg-slate-900/60">
              <div className="mb-2 grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {monthCells.map((c, i) => {
                  const evs = eventsOn(c.key);
                  const isToday = c.key === todayKey;
                  const isSelected = c.key === selectedDay;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!c.day}
                      onClick={() => {
                        if (!c.key) return;
                        setSelectedDay(c.key);
                        const [yy, mm, dd] = c.key.split('-').map(Number);
                        setCursor(new Date(yy, mm - 1, dd));
                      }}
                      className={`min-h-[68px] rounded-2xl p-1 text-left transition sm:min-h-[88px] ${
                        !c.day
                          ? 'bg-transparent'
                          : isSelected
                            ? 'bg-primary/15 ring-2 ring-primary/40'
                            : isToday
                              ? 'bg-primary/10 ring-1 ring-primary/25'
                              : 'bg-white/60 hover:bg-white dark:bg-slate-800/50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {c.day ? (
                        <>
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                              isToday ? 'bg-primary text-white' : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {c.day}
                          </span>
                          <div className="mt-0.5 flex flex-wrap gap-0.5">
                            {evs.slice(0, 4).map((e) => (
                              <span
                                key={`${e.type}-${e.id}`}
                                className="h-1.5 w-1.5 rounded-full"
                                style={{ background: e.color }}
                                title={e.title}
                              />
                            ))}
                            {evs.length > 4 ? (
                              <span className="text-[9px] text-slate-400">+{evs.length - 4}</span>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : view === 'week' ? (
            <div className="glass-card space-y-2 rounded-[28px] p-3 shadow-soft sm:p-4">
              {weekDays.map(({ date, key }) => {
                const evs = eventsOn(key);
                const isToday = key === todayKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedDay(key);
                      setCursor(date);
                    }}
                    className={`flex w-full gap-3 rounded-2xl p-3 text-left transition ${
                      selectedDay === key
                        ? 'bg-primary/10 ring-1 ring-primary/30'
                        : 'hover:bg-white/70 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="w-14 shrink-0 text-center">
                      <p className="text-[10px] font-bold uppercase text-slate-400">
                        {date.toLocaleDateString(undefined, { weekday: 'short' })}
                      </p>
                      <p
                        className={`text-lg font-bold ${isToday ? 'text-primary' : 'text-slate-800 dark:text-white'}`}
                      >
                        {date.getDate()}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {evs.length === 0 ? (
                        <p className="py-2 text-xs text-slate-400">No events</p>
                      ) : (
                        evs.map((e) => (
                          <div
                            key={`${e.type}-${e.id}`}
                            className="flex items-center gap-2 rounded-xl bg-white/80 px-2.5 py-1.5 text-xs dark:bg-slate-800/80"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              void openItem(e);
                            }}
                          >
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: e.color }} />
                            <span className="truncate font-medium">{e.title}</span>
                            <span className="ml-auto shrink-0 text-slate-400">
                              {formatEventWhen(e.start).time}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : view === 'day' ? (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                {cursor.toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </h2>
              {eventsOn(localDateKey(cursor)).length === 0 ? (
                <EmptyState onAdd={() => setShowPersonal(true)} />
              ) : (
                eventsOn(localDateKey(cursor)).map((e) => (
                  <EventCard
                    key={`${e.type}-${e.id}`}
                    item={e}
                    onOpen={() => void openItem(e)}
                    onDeletePersonal={removePersonal}
                  />
                ))
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {agendaItems.length === 0 ? (
                <EmptyState onAdd={() => setShowPersonal(true)} />
              ) : (
                agendaItems.map((e) => (
                  <EventCard
                    key={`${e.type}-${e.id}`}
                    item={e}
                    onOpen={() => void openItem(e)}
                    onDeletePersonal={removePersonal}
                  />
                ))
              )}
            </div>
          )}

          {/* Selected day (mobile under calendar) */}
          {view === 'month' && selectedDay ? (
            <section className="space-y-2 lg:hidden">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                {new Date(selectedDay + 'T12:00:00').toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </h2>
              {dayEvents.length === 0 ? (
                <p className="rounded-[22px] border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400 dark:border-slate-700">
                  No events this day
                </p>
              ) : (
                dayEvents.map((e) => (
                  <EventCard
                    key={`${e.type}-${e.id}`}
                    item={e}
                    onOpen={() => void openItem(e)}
                    onDeletePersonal={removePersonal}
                  />
                ))
              )}
            </section>
          ) : null}
        </div>

        {/* Side panel — desktop */}
        <aside className="hidden min-w-0 space-y-4 lg:block">
          <section className="glass-card rounded-[28px] p-4 shadow-soft dark:bg-slate-900/60">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                {selectedDay
                  ? new Date(selectedDay + 'T12:00:00').toLocaleDateString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'Selected day'}
              </h2>
              <CalendarDays size={16} className="text-primary" />
            </div>
            {dayEvents.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">Tap a date to see events</p>
            ) : (
              <div className="max-h-[280px] space-y-2 overflow-y-auto">
                {dayEvents.map((e) => (
                  <button
                    key={`${e.type}-${e.id}`}
                    type="button"
                    onClick={() => void openItem(e)}
                    className="flex w-full items-start gap-2 rounded-2xl bg-white/70 p-2.5 text-left transition hover:bg-white dark:bg-slate-800/70"
                  >
                    <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: e.color }} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {e.title}
                      </p>
                      <p className="text-[11px] text-slate-500">{formatEventWhen(e.start).time}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="glass-card rounded-[28px] p-4 shadow-soft dark:bg-slate-900/60">
            <div className="mb-3 flex items-center gap-2">
              <Bell size={16} className="text-amber-500" />
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Upcoming
              </h2>
            </div>
            {upcoming.length === 0 ? (
              <p className="py-4 text-center text-xs text-slate-400">Nothing upcoming</p>
            ) : (
              <div className="max-h-[320px] space-y-2 overflow-y-auto">
                {upcoming.slice(0, 8).map((e) => (
                  <button
                    key={`up-${e.type}-${e.id}`}
                    type="button"
                    onClick={() => void openItem(e)}
                    className="flex w-full gap-2 rounded-2xl p-2 text-left hover:bg-white/60 dark:hover:bg-slate-800/60"
                  >
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: e.color }} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.title}</p>
                      <p className="text-[10px] text-slate-400">
                        {formatEventWhen(e.start).date} · {formatEventWhen(e.start).time}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      {/* Create personal event modal */}
      <AnimatePresence>
        {showPersonal ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={() => setShowPersonal(false)}
          >
            <motion.form
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={savePersonal}
              className="max-h-[90dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-[28px] bg-white p-6 shadow-2xl dark:bg-slate-900 sm:rounded-[28px]"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold dark:text-white">Personal event</h2>
                  <p className="text-xs text-slate-500">Only you can see this</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPersonal(false)}
                  className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X size={18} />
                </button>
              </div>
              {formError ? <p className="text-sm text-error">{formError}</p> : null}
              <input
                required
                placeholder="Title *"
                value={personalForm.title}
                onChange={(e) => setPersonalForm({ ...personalForm, title: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <textarea
                placeholder="Description (optional)"
                value={personalForm.description}
                onChange={(e) => setPersonalForm({ ...personalForm, description: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                rows={2}
              />
              <select
                value={personalForm.type}
                onChange={(e) => setPersonalForm({ ...personalForm, type: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {PERSONAL_TYPES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <label className="block text-xs font-medium text-slate-500">Start *</label>
              <input
                required
                type="datetime-local"
                value={personalForm.startsAt}
                onChange={(e) => setPersonalForm({ ...personalForm, startsAt: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <label className="block text-xs font-medium text-slate-500">End (optional)</label>
              <input
                type="datetime-local"
                value={personalForm.endsAt}
                onChange={(e) => setPersonalForm({ ...personalForm, endsAt: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <label className="block text-xs font-medium text-slate-500">Reminder</label>
              <select
                value={personalForm.reminderOffset}
                onChange={(e) =>
                  setPersonalForm({ ...personalForm, reminderOffset: e.target.value })
                }
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                {REMINDER_OPTIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-full bg-emerald-500 py-3 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPersonal(false)}
                  className="rounded-full bg-slate-100 px-5 py-3 text-sm font-semibold dark:bg-slate-800 dark:text-white"
                >
                  Cancel
                </button>
              </div>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Detail modal */}
      <AnimatePresence>
        {detailItem ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={() => {
              setDetailItem(null);
              setDetailCampus(null);
            }}
          >
            <motion.div
              initial={{ y: 40 }}
              animate={{ y: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white shadow-2xl dark:bg-slate-900 sm:rounded-[28px]"
            >
              {detailLoading ? (
                <div className="flex h-48 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
                </div>
              ) : (
                <>
                  {(detailCampus?.bannerUrl || detailItem.bannerUrl) && (
                    <img
                      src={
                        resolveMediaUrl(detailCampus?.bannerUrl || detailItem.bannerUrl) ||
                        undefined
                      }
                      alt=""
                      className="h-40 w-full object-cover"
                    />
                  )}
                  <div className="space-y-4 p-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          <span
                            className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                            style={{ background: detailItem.color }}
                          >
                            {detailItem.category}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(detailItem.status)}`}
                          >
                            {detailCampus?.status || detailItem.status}
                          </span>
                        </div>
                        <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                          {detailCampus?.title || detailItem.title}
                        </h2>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDetailItem(null);
                          setDetailCampus(null);
                        }}
                        className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {detailCampus?.description ||
                        detailItem.description ||
                        'No description.'}
                    </p>

                    <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                      <Meta
                        icon={<Clock size={14} />}
                        label={`${formatEventWhen(detailCampus?.startsAt || detailItem.start).date} · ${formatEventWhen(detailCampus?.startsAt || detailItem.start).time}`}
                      />
                      {(detailCampus?.venue || detailItem.venue) && (
                        <Meta icon={<MapPin size={14} />} label={detailCampus?.venue || detailItem.venue || ''} />
                      )}
                      {(detailCampus?.organizer || detailItem.organizer) && (
                        <Meta
                          icon={<Users size={14} />}
                          label={detailCampus?.organizer || detailItem.organizer || ''}
                        />
                      )}
                      {(detailCampus?.department || detailItem.department) && (
                        <Meta
                          icon={<Building2 size={14} />}
                          label={detailCampus?.department || detailItem.department || ''}
                        />
                      )}
                      {detailCampus?.speaker && (
                        <Meta icon={<Users size={14} />} label={`Speaker: ${detailCampus.speaker}`} />
                      )}
                      {detailCampus && (
                        <Meta
                          icon={<Users size={14} />}
                          label={`${detailCampus.registeredCount} joined${detailCampus.capacity ? ` / ${detailCampus.capacity}` : ''}`}
                        />
                      )}
                      {detailItem.reminderAt && (
                        <Meta
                          icon={<Bell size={14} />}
                          label={`Reminder · ${new Date(detailItem.reminderAt).toLocaleString()}`}
                        />
                      )}
                    </div>

                    {detailCampus?.participants && detailCampus.participants.length > 0 ? (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                          Participants
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {detailCampus.participants.slice(0, 12).map((p) => (
                            <span
                              key={p.id}
                              className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium dark:bg-slate-800"
                            >
                              {p.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap gap-2 pt-1">
                      {detailItem.type === 'campus' && detailCampus ? (
                        <button
                          type="button"
                          disabled={busyId === detailCampus.id || detailCampus.status === 'CANCELLED'}
                          onClick={() =>
                            void toggleJoin(detailCampus.id, detailCampus.joined)
                          }
                          className={`flex-1 rounded-full py-3 text-sm font-semibold text-white ${
                            detailCampus.joined
                              ? 'bg-slate-500'
                              : 'bg-gradient-to-r from-primary to-blue-600'
                          } disabled:opacity-50`}
                        >
                          {detailCampus.joined ? 'Leave event' : 'Join event'}
                        </button>
                      ) : null}
                      {detailItem.type === 'campus' ? (
                        <Link
                          to={`/home/events?id=${detailItem.id}`}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-4 py-3 text-sm font-semibold dark:bg-slate-800 dark:text-white"
                        >
                          <ExternalLink size={14} /> Full page
                        </Link>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => shareItem(detailItem)}
                        className="rounded-full bg-slate-100 p-3 dark:bg-slate-800"
                        aria-label="Share"
                      >
                        <Share2 size={16} />
                      </button>
                      {detailItem.type === 'personal' ? (
                        <button
                          type="button"
                          onClick={() => void removePersonal(detailItem.id)}
                          className="rounded-full bg-rose-50 p-3 text-rose-600 dark:bg-rose-950"
                          aria-label="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function Meta({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-400">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/50 px-6 py-14 text-center dark:border-slate-700 dark:bg-slate-900/40">
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-2xl">
        📅
      </div>
      <p className="font-semibold text-slate-800 dark:text-white">No events in this range</p>
      <p className="mt-1 text-sm text-slate-500">Add a personal reminder or browse campus events.</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={onAdd}
          className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white"
        >
          Add reminder
        </button>
        <Link
          to="/home/events"
          className="rounded-full bg-primary/10 px-4 py-2 text-sm font-semibold text-primary"
        >
          Browse events
        </Link>
      </div>
    </div>
  );
}

function EventCard({
  item,
  onOpen,
  onDeletePersonal,
}: {
  item: CalendarItem;
  onOpen: () => void;
  onDeletePersonal: (id: string) => void;
}) {
  const when = formatEventWhen(item.start);
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card flex gap-3 rounded-[22px] p-3.5 shadow-soft transition hover:shadow-float dark:bg-slate-900/50"
    >
      <span
        className="mt-1 h-10 w-1 shrink-0 rounded-full"
        style={{ background: item.color }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusBadgeClass(item.status)}`}
          >
            {item.status}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {item.type} · {item.category}
          </span>
          {item.reminderAt ? <Bell size={12} className="text-amber-500" /> : null}
        </div>
        <button type="button" onClick={onOpen} className="text-left">
          <h3 className="font-semibold text-slate-900 dark:text-white">{item.title}</h3>
        </button>
        <p className="mt-0.5 text-xs text-slate-500">
          {when.date} · {when.time}
          {item.venue ? ` · ${item.venue}` : ''}
        </p>
        {item.organizer ? (
          <p className="text-[11px] text-slate-400">by {item.organizer}</p>
        ) : null}
        {item.type === 'campus' && (item.registeredCount ?? 0) > 0 ? (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
            <Users size={12} /> {item.registeredCount}
            {item.capacity ? ` / ${item.capacity}` : ''} joined
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary"
        >
          View
        </button>
        {item.type === 'personal' ? (
          <button
            type="button"
            onClick={() => onDeletePersonal(item.id)}
            className="rounded-full p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"
            aria-label="Delete"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
    </motion.article>
  );
}
