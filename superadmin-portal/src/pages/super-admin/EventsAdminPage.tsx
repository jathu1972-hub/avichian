import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { api } from '../../lib/api';

interface EventRow {
  id: string;
  title: string;
  description: string;
  category: string;
  department: string | null;
  venue: string | null;
  organizer: string | null;
  speaker: string | null;
  capacity: number | null;
  registeredCount: number;
  startsAt: string;
  endsAt: string | null;
  registrationDeadline: string | null;
  visibility: string;
  status: string;
  published: boolean;
  featured: boolean;
  bannerUrl: string | null;
}

interface Department {
  id: string;
  name: string;
}

interface Participant {
  id: string;
  regNo: string;
  name: string;
  email: string;
  department: string;
  joinedAt: string;
}

const CATEGORIES = [
  'COLLEGE',
  'DEPARTMENT',
  'CLUBS',
  'WORKSHOPS',
  'SPORTS',
  'CULTURAL',
  'SEMINARS',
  'COMPETITIONS',
  'EXAMS',
  'HOLIDAYS',
  'OTHER',
];

const emptyForm = {
  title: '',
  description: '',
  category: 'COLLEGE',
  departmentId: '',
  venue: '',
  organizer: '',
  speaker: '',
  capacity: '',
  startsAt: '',
  endsAt: '',
  registrationDeadline: '',
  visibility: 'ALL_STUDENTS',
  status: 'UPCOMING',
  published: true,
  featured: false,
  bannerUrl: '',
};

export function EventsAdminPage() {
  const [items, setItems] = useState<EventRow[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [participants, setParticipants] = useState<Participant[] | null>(null);
  const [participantsEvent, setParticipantsEvent] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await api<EventRow[]>('/super-admin/events');
    setItems(res.data ?? []);
  }, []);

  useEffect(() => {
    void load();
    api<Department[]>('/super-admin/departments').then((res) => {
      setDepartments(res.data ?? []);
      if (res.data?.[0]) {
        setForm((f) => ({ ...f, departmentId: f.departmentId || res.data![0].id }));
      }
    });
  }, [load]);

  function toLocalInput(iso: string | null | undefined) {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function fillEdit(ev: EventRow) {
    setEditingId(ev.id);
    setForm({
      title: ev.title,
      description: ev.description ?? '',
      category: ev.category,
      departmentId: '',
      venue: ev.venue ?? '',
      organizer: ev.organizer ?? '',
      speaker: ev.speaker ?? '',
      capacity: ev.capacity != null ? String(ev.capacity) : '',
      startsAt: toLocalInput(ev.startsAt),
      endsAt: toLocalInput(ev.endsAt),
      registrationDeadline: toLocalInput(ev.registrationDeadline),
      visibility: ev.visibility,
      status: ev.status,
      published: ev.published,
      featured: ev.featured,
      bannerUrl: ev.bannerUrl ?? '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    const body = {
      title: form.title,
      description: form.description || undefined,
      category: form.category,
      departmentId: form.departmentId || null,
      venue: form.venue || undefined,
      organizer: form.organizer || undefined,
      speaker: form.speaker || undefined,
      capacity: form.capacity ? Number(form.capacity) : null,
      startsAt: new Date(form.startsAt).toISOString(),
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      registrationDeadline: form.registrationDeadline
        ? new Date(form.registrationDeadline).toISOString()
        : null,
      visibility: form.visibility,
      status: form.status,
      published: form.published,
      featured: form.featured,
      bannerUrl: form.bannerUrl || null,
    };
    try {
      if (editingId) {
        await api(`/super-admin/events/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        setMessage('Event updated in PostgreSQL');
      } else {
        await api('/super-admin/events', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        setMessage('Event published — students will see it on Events & Calendar');
      }
      setForm((f) => ({ ...emptyForm, departmentId: f.departmentId }));
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this event permanently?')) return;
    await api(`/super-admin/events/${id}`, { method: 'DELETE' });
    setMessage('Event deleted');
    await load();
  }

  async function cancelEvent(id: string) {
    await api(`/super-admin/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'CANCELLED' }),
    });
    setMessage('Event cancelled — participants notified');
    await load();
  }

  async function hideEvent(id: string, published: boolean) {
    await api(`/super-admin/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ published: !published, status: published ? 'HIDDEN' : 'UPCOMING' }),
    });
    await load();
  }

  async function viewParticipants(ev: EventRow) {
    const res = await api<{ participants: Participant[]; event: { title: string } }>(
      `/super-admin/events/${ev.id}/participants`,
    );
    setParticipants(res.data?.participants ?? []);
    setParticipantsEvent(res.data?.event.title ?? ev.title);
  }

  function exportCsv(id: string) {
    // Open CSV download via API with token is hard; use fetch blob
    const token = localStorage.getItem('avichian_access_token');
    void (async () => {
      const base = (await import('../../lib/config')).getApiBase();
      const res = await fetch(`${base}/super-admin/events/${id}/participants.csv`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `event-${id}-participants.csv`;
      a.click();
      URL.revokeObjectURL(url);
    })();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Event Management</h1>
        <p className="text-sm opacity-60">
          Create campus events in PostgreSQL — students see them on Events &amp; Calendar
        </p>
      </div>

      {message ? (
        <div className="rounded-[20px] bg-success/10 px-4 py-3 text-sm text-success">{message}</div>
      ) : null}
      {error ? <p className="rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p> : null}

      <form onSubmit={submit} className="glass-card space-y-3 rounded-[24px] p-5">
        <h2 className="font-semibold">{editingId ? 'Edit event' : 'Create event'}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label="Event title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-600">Category</span>
            <select
              className="min-h-12 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-sm"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-600">Department</span>
            <select
              className="min-h-12 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-sm"
              value={form.departmentId}
              onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
            >
              <option value="">— None / college-wide —</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Venue"
            value={form.venue}
            onChange={(e) => setForm({ ...form, venue: e.target.value })}
          />
          <Input
            label="Organizer"
            value={form.organizer}
            onChange={(e) => setForm({ ...form, organizer: e.target.value })}
          />
          <Input
            label="Speaker"
            value={form.speaker}
            onChange={(e) => setForm({ ...form, speaker: e.target.value })}
          />
          <Input
            label="Capacity (optional)"
            type="number"
            min={1}
            value={form.capacity}
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          />
          <Input
            label="Start"
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            required
          />
          <Input
            label="End"
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
          />
          <Input
            label="Registration deadline"
            type="datetime-local"
            value={form.registrationDeadline}
            onChange={(e) => setForm({ ...form, registrationDeadline: e.target.value })}
          />
          <Input
            label="Banner image URL"
            value={form.bannerUrl}
            onChange={(e) => setForm({ ...form, bannerUrl: e.target.value })}
            placeholder="/api/media/... or https://..."
          />
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-600">Visibility</span>
            <select
              className="min-h-12 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-sm"
              value={form.visibility}
              onChange={(e) => setForm({ ...form, visibility: e.target.value })}
            >
              <option value="ALL_STUDENTS">All students</option>
              <option value="DEPARTMENT_ONLY">Department only</option>
            </select>
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-medium text-slate-600">Status</span>
            <select
              className="min-h-12 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-sm"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option value="UPCOMING">Upcoming</option>
              <option value="LIVE">Live</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="DRAFT">Draft</option>
              <option value="HIDDEN">Hidden</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
            />
            Published
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.featured}
              onChange={(e) => setForm({ ...form, featured: e.target.checked })}
            />
            Featured hero
          </label>
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="w-auto" loading={saving}>
            {editingId ? 'Save changes' : 'Publish event'}
          </Button>
          {editingId ? (
            <Button
              type="button"
              variant="secondary"
              className="w-auto"
              onClick={() => {
                setEditingId(null);
                setForm((f) => ({ ...emptyForm, departmentId: f.departmentId }));
              }}
            >
              Cancel edit
            </Button>
          ) : null}
        </div>
      </form>

      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400">No campus events yet. Create one above.</p>
        ) : (
          items.map((ev) => (
            <div key={ev.id} className="glass-card rounded-[24px] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{ev.title}</p>
                  <p className="text-sm text-slate-500">{ev.description}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {ev.category} · {ev.status}
                    {ev.published ? ' · Published' : ' · Hidden'}
                    {ev.featured ? ' · Featured' : ''}
                    <br />
                    {new Date(ev.startsAt).toLocaleString()}
                    {ev.venue ? ` · ${ev.venue}` : ''}
                    <br />
                    {ev.registeredCount} joined
                    {ev.capacity != null ? ` / ${ev.capacity} capacity` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => fillEdit(ev)}
                    className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => viewParticipants(ev)}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium"
                  >
                    Participants
                  </button>
                  <button
                    type="button"
                    onClick={() => exportCsv(ev.id)}
                    className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium"
                  >
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => hideEvent(ev.id, ev.published)}
                    className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800"
                  >
                    {ev.published ? 'Hide' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelEvent(ev.id)}
                    className="rounded-full bg-warning/15 px-3 py-1.5 text-xs font-medium text-warning"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(ev.id)}
                    className="rounded-full bg-error/10 px-3 py-1.5 text-xs font-medium text-error"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {participants ? (
        <div className="glass-card rounded-[24px] p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Participants · {participantsEvent}</h3>
            <button
              type="button"
              onClick={() => setParticipants(null)}
              className="text-xs text-slate-500"
            >
              Close
            </button>
          </div>
          {participants.length === 0 ? (
            <p className="text-sm text-slate-400">No participants yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {participants.map((p) => (
                <li key={p.id} className="rounded-xl bg-slate-50 px-3 py-2">
                  <span className="font-medium">{p.name}</span>{' '}
                  <span className="text-slate-500">
                    {p.regNo} · {p.email} · {p.department}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
