import { api } from './api';

export const REPORT_REASONS = [
  { id: 'SPAM', label: 'Spam' },
  { id: 'FAKE_ACCOUNT', label: 'Fake account' },
  { id: 'HARASSMENT', label: 'Harassment' },
  { id: 'BULLYING', label: 'Bullying' },
  { id: 'HATE_SPEECH', label: 'Hate speech' },
  { id: 'THREATS', label: 'Threats' },
  { id: 'VIOLENCE', label: 'Violence' },
  { id: 'ADULT_CONTENT', label: 'Sexual content' },
  { id: 'NUDITY', label: 'Nudity' },
  { id: 'CHILD_SAFETY', label: 'Child safety' },
  { id: 'SCAM', label: 'Scam / fraud' },
  { id: 'COPYRIGHT', label: 'Copyright violation' },
  { id: 'MISINFORMATION', label: 'Misinformation' },
  { id: 'IMPERSONATION', label: 'Impersonation' },
  { id: 'ILLEGAL_CONTENT', label: 'Illegal content' },
  { id: 'SELF_HARM', label: 'Self-harm concern' },
  { id: 'TERRORISM', label: 'Terrorism / extremism' },
  { id: 'INAPPROPRIATE_LANGUAGE', label: 'Inappropriate language' },
  { id: 'INAPPROPRIATE', label: 'Inappropriate' },
  { id: 'OTHER', label: 'Other' },
] as const;

export type ReportTargetType =
  | 'POST'
  | 'STORY'
  | 'REEL'
  | 'MESSAGE'
  | 'USER'
  | 'COMMENT'
  | 'COMMUNITY';

export async function submitReport(body: {
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details?: string;
  evidenceUrl?: string | null;
}) {
  const res = await api<{ id: string; status: string; message: string }>('/safety/report', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.data!;
}

export async function fetchMyReports() {
  const res = await api('/safety/reports/my');
  return res.data ?? [];
}

export async function blockUserSafety(userId: string) {
  return api('/safety/block', { method: 'POST', body: JSON.stringify({ userId }) });
}

export async function unblockUserSafety(userId: string) {
  return api(`/safety/block/${userId}`, { method: 'DELETE' });
}

export async function muteUser(userId: string) {
  return api('/safety/mute', { method: 'POST', body: JSON.stringify({ userId }) });
}

export async function unmuteUser(userId: string) {
  return api(`/safety/mute/${userId}`, { method: 'DELETE' });
}

export async function fetchMutedUsers() {
  const res = await api('/safety/mute');
  return res.data ?? [];
}

export async function submitComplaint(body: {
  category: string;
  subject: string;
  description: string;
  attachmentUrl?: string | null;
  priority?: string;
}) {
  const res = await api<{ id: string; ticketNumber: string; message: string }>(
    '/safety/complaints',
    { method: 'POST', body: JSON.stringify(body) },
  );
  return res.data!;
}

export async function fetchMyComplaints() {
  const res = await api('/safety/complaints/my');
  return res.data ?? [];
}
