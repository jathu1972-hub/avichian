import { api } from './api';

export interface SettingsBundle {
  account: {
    id: string;
    regNo: string;
    name: string;
    email: string;
    bio: string | null;
    department: string;
    year: number | null;
    profilePhotoUrl: string | null;
    coverPhotoUrl: string | null;
    profilePrivacy: string;
    mfaEnabled: boolean;
    accountStatus: string;
    lastLoginAt: string | null;
  };
  privacy: {
    privateAccount: boolean;
    whoCanMessage: string;
    whoCanCall: string;
    whoCanSeePosts: string;
    whoCanSeeStories: string;
    whoCanSeeProfile: string;
  };
  notifications: {
    likes: boolean;
    comments: boolean;
    friendRequests: boolean;
    messages: boolean;
    calls: boolean;
    events: boolean;
    communities: boolean;
    announcements: boolean;
    reminders: boolean;
    pushEnabled: boolean;
  };
  appearance: {
    theme: string;
    accentColor: string;
    fontScale: string;
  };
  sessions: Array<{
    id: string;
    ipAddress: string | null;
    userAgent: string | null;
    deviceLabel: string | null;
    rememberMe: boolean;
    createdAt: string;
    expiresAt: string;
  }>;
  storage: {
    totalBytes: number;
    totalFiles: number;
    limitBytes: number;
    usedPercent: number;
    byPurpose: Record<string, { bytes: number; count: number }>;
  };
}

export async function fetchSettings() {
  const res = await api<SettingsBundle>('/settings');
  return res.data!;
}

export async function updatePrivacy(body: Partial<SettingsBundle['privacy']>) {
  const res = await api<SettingsBundle['privacy']>('/settings/privacy', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return res.data!;
}

export async function updateNotifications(body: Partial<SettingsBundle['notifications']>) {
  const res = await api<SettingsBundle['notifications']>('/settings/notifications', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return res.data!;
}

export async function updateAppearance(body: Partial<SettingsBundle['appearance']>) {
  const res = await api<SettingsBundle['appearance']>('/settings/appearance', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return res.data!;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return api<{ message: string; user?: unknown; forcePasswordChange?: boolean }>(
    '/auth/password/change',
    {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword: newPassword }),
    },
  );
}

export async function logoutAllDevices() {
  return api<{ revoked: number }>('/settings/logout-all', { method: 'POST' });
}

export async function fetchLoginHistory() {
  const res = await api<
    Array<{
      id: string;
      success: boolean;
      ipAddress: string | null;
      userAgent: string | null;
      createdAt: string;
    }>
  >('/settings/login-history');
  return res.data ?? [];
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
