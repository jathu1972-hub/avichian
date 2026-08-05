import { api } from './api';

export type EventCategory =
  | 'ALL'
  | 'COLLEGE'
  | 'DEPARTMENT'
  | 'CLUBS'
  | 'WORKSHOPS'
  | 'SPORTS'
  | 'CULTURAL'
  | 'SEMINARS'
  | 'COMPETITIONS'
  | 'EXAMS'
  | 'HOLIDAYS'
  | 'OTHER';

export type EventStatus = 'UPCOMING' | 'LIVE' | 'COMPLETED' | 'CANCELLED' | 'DRAFT' | 'HIDDEN';

export interface CampusEvent {
  id: string;
  title: string;
  description: string;
  category: Exclude<EventCategory, 'ALL'>;
  department: string | null;
  venue: string | null;
  bannerUrl: string | null;
  organizer: string | null;
  speaker: string | null;
  capacity: number | null;
  registeredCount: number;
  interestedCount: number;
  remainingSeats: number | null;
  startsAt: string;
  endsAt: string | null;
  registrationDeadline: string | null;
  visibility: string;
  status: EventStatus;
  featured: boolean;
  gallery: unknown[];
  schedule: unknown[];
  countdownMs: number;
  joined: boolean;
  interested: boolean;
  bookmarked: boolean;
  participants?: Array<{
    id: string;
    regNo: string;
    name: string;
    photo: string | null;
    joinedAt: string;
  }>;
  interestedStudents?: Array<{
    id: string;
    regNo: string;
    name: string;
    photo: string | null;
  }>;
}

export interface CalendarItem {
  id: string;
  title: string;
  description?: string;
  start: string;
  end: string | null;
  venue: string | null;
  organizer?: string | null;
  speaker?: string | null;
  bannerUrl?: string | null;
  type: 'campus' | 'personal' | 'legacy';
  category: string;
  color: string;
  status: string;
  department: string | null;
  registeredCount?: number;
  capacity?: number | null;
  joined?: boolean;
  reminderAt?: string | null;
}

export interface CalendarPayload {
  items: CalendarItem[];
  upcoming?: CalendarItem[];
  reminders?: CalendarItem[];
  from?: string;
  to?: string;
}

export async function fetchEvents(params: {
  search?: string;
  category?: string;
  filter?: string;
}) {
  const q = new URLSearchParams();
  if (params.search) q.set('search', params.search);
  if (params.category) q.set('category', params.category);
  if (params.filter) q.set('filter', params.filter);
  const res = await api<{
    items: CampusEvent[];
    featured: CampusEvent | null;
    categories: string[];
  }>(`/events?${q.toString()}`);
  return res.data ?? { items: [], featured: null, categories: [] };
}

export async function fetchEventDetail(id: string) {
  const res = await api<CampusEvent>(`/events/${id}`);
  return res.data!;
}

export async function joinEvent(id: string) {
  return api(`/events/${id}/join`, { method: 'POST' });
}

export async function leaveEvent(id: string) {
  return api(`/events/${id}/leave`, { method: 'POST' });
}

export async function toggleInterest(id: string) {
  return api<{ interested: boolean }>(`/events/${id}/interest`, { method: 'POST' });
}

export async function toggleBookmark(id: string) {
  return api<{ bookmarked: boolean }>(`/events/${id}/bookmark`, { method: 'POST' });
}

export async function fetchCalendar(from: string, to: string): Promise<CalendarPayload> {
  const res = await api<CalendarPayload>(
    `/events/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  return res.data ?? { items: [] };
}

export async function createPersonalEvent(body: {
  title: string;
  description?: string;
  type?: string;
  startsAt: string;
  endsAt?: string;
  reminderOffset?: string | null;
  reminderAt?: string | null;
}) {
  return api('/events/personal', { method: 'POST', body: JSON.stringify(body) });
}

export async function updatePersonalEvent(
  id: string,
  body: {
    title?: string;
    description?: string;
    type?: string;
    startsAt?: string;
    endsAt?: string | null;
    reminderOffset?: string | null;
    reminderAt?: string | null;
  },
) {
  return api(`/events/personal/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export async function deletePersonalEvent(id: string) {
  return api(`/events/personal/${id}`, { method: 'DELETE' });
}

export function formatEventWhen(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
}

export function countdownLabel(ms: number) {
  if (ms <= 0) return 'Starting now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function statusBadgeClass(status: string) {
  switch (status) {
    case 'LIVE':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
    case 'UPCOMING':
      return 'bg-sky-500/15 text-sky-700 dark:text-sky-300';
    case 'COMPLETED':
      return 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
    case 'CANCELLED':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300';
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }
}

/** Local calendar day key YYYY-MM-DD (not UTC). */
export function localDateKey(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function itemDateKey(iso: string) {
  const d = new Date(iso);
  return localDateKey(d);
}

export const CATEGORY_CHIPS: { id: EventCategory; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'COLLEGE', label: 'College' },
  { id: 'DEPARTMENT', label: 'Department' },
  { id: 'CLUBS', label: 'Clubs' },
  { id: 'WORKSHOPS', label: 'Workshops' },
  { id: 'SPORTS', label: 'Sports' },
  { id: 'CULTURAL', label: 'Cultural' },
  { id: 'SEMINARS', label: 'Seminars' },
  { id: 'COMPETITIONS', label: 'Competitions' },
  { id: 'EXAMS', label: 'Exams' },
  { id: 'HOLIDAYS', label: 'Holidays' },
];

export const PERSONAL_TYPES = [
  { id: 'REMINDER', label: 'Reminder' },
  { id: 'ASSIGNMENT', label: 'Assignment' },
  { id: 'MEETING', label: 'Meeting' },
  { id: 'PROJECT', label: 'Project' },
  { id: 'BIRTHDAY', label: 'Birthday' },
  { id: 'PRACTICE', label: 'Practice' },
  { id: 'OTHER', label: 'Other' },
] as const;

export const REMINDER_OPTIONS = [
  { id: 'none', label: 'No reminder' },
  { id: '30m', label: '30 minutes before' },
  { id: '1h', label: '1 hour before' },
  { id: '2h', label: '2 hours before' },
  { id: '1d', label: '1 day before' },
] as const;
