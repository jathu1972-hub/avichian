import { Megaphone, Upload, CalendarPlus } from 'lucide-react';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { isStaffRole } from '../../lib/portal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { api, getAccessToken, prefetchCsrfToken } from '../../lib/api';
import { getApiBase } from '../../lib/config';

export function StaffToolsPage() {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [eventName, setEventName] = useState('');
  const [eventWhen, setEventWhen] = useState('');
  const [venue, setVenue] = useState('');

  if (!isStaffRole(user?.role)) {
    return <Navigate to="/home" replace />;
  }

  async function publishAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await api('/campus/announcements', {
        method: 'POST',
        body: JSON.stringify({ title, body }),
      });
      setTitle('');
      setBody('');
      setMessage('Announcement published');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  async function createEvent(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      await api('/campus/events', {
        method: 'POST',
        body: JSON.stringify({
          name: eventName,
          startsAt: new Date(eventWhen).toISOString(),
          venue: venue || undefined,
        }),
      });
      setEventName('');
      setEventWhen('');
      setVenue('');
      setMessage('Event created');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }

  async function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData();
      form.append('file', file);
      const token = getAccessToken();
      const csrf = await prefetchCsrfToken();
      const res = await fetch(`${getApiBase()}/campus/students/import`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
        },
        body: form,
      });
      const { parseApiJson } = await import('../../lib/api');
      const { json } = await parseApiJson<{
        data?: { imported?: number; updated?: number };
        error?: string;
        message?: string;
      }>(res);
      if (!res.ok) throw new Error(json.error ?? json.message ?? 'Import failed');
      setMessage(
        `Import: ${json.data?.imported ?? 0} new, ${json.data?.updated ?? 0} updated`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Staff tools</h1>
        <p className="text-sm text-slate-500">
          Verified staff · same AVICHIAN app · no separate website
        </p>
      </div>

      {message ? <p className="rounded-[20px] bg-success/10 px-4 py-3 text-sm text-success">{message}</p> : null}
      {error ? <p className="rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p> : null}

      <form onSubmit={publishAnnouncement} className="glass-card space-y-3 rounded-[24px] p-5 shadow-soft">
        <div className="flex items-center gap-2 text-primary">
          <Megaphone size={18} />
          <h2 className="font-semibold">Announcement</h2>
        </div>
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <label className="block space-y-2">
          <span className="text-sm font-medium text-slate-600">Body</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={3}
            className="w-full rounded-[20px] border border-slate-200 bg-white/80 px-4 py-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <Button type="submit" loading={loading} className="w-auto">
          Publish
        </Button>
      </form>

      <form onSubmit={createEvent} className="glass-card space-y-3 rounded-[24px] p-5 shadow-soft">
        <div className="flex items-center gap-2 text-primary">
          <CalendarPlus size={18} />
          <h2 className="font-semibold">Create event</h2>
        </div>
        <Input label="Event name" value={eventName} onChange={(e) => setEventName(e.target.value)} required />
        <Input label="Date & time" type="datetime-local" value={eventWhen} onChange={(e) => setEventWhen(e.target.value)} required />
        <Input label="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
        <Button type="submit" loading={loading} className="w-auto">
          Create event
        </Button>
      </form>

      <div className="glass-card space-y-3 rounded-[24px] p-5 shadow-soft">
        <div className="flex items-center gap-2 text-primary">
          <Upload size={18} />
          <h2 className="font-semibold">Import student master CSV</h2>
        </div>
        <p className="text-xs text-slate-500">
          Columns: name,reg_no,mobile,email,department,year,section
        </p>
        <label className="inline-flex cursor-pointer rounded-[22px] bg-primary px-5 py-3 text-sm font-semibold text-white">
          {loading ? 'Working…' : 'Choose CSV'}
          <input type="file" accept=".csv,text/csv" className="hidden" onChange={importCsv} disabled={loading} />
        </label>
      </div>
    </div>
  );
}
