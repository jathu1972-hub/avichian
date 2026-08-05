import {
  ArrowLeft,
  Ban,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MessageSquareWarning,
  Pencil,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { isValidPasswordDetailed } from '@avichian/shared';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { api } from '../../lib/api';

type TabId = 'posts' | 'stories' | 'comments' | 'reports' | 'activity' | 'security';

interface StudentProfileData {
  profile: {
    id: string;
    regNo: string;
    fullName: string;
    collegeEmail: string;
    mobile: string | null;
    department: string;
    departmentId: string;
    year: number | null;
    profilePhotoUrl: string | null;
    coverPhotoUrl: string | null;
    accountStatus: string;
    verificationStatus: string;
    joinDate: string;
    lastLoginAt: string | null;
    lastSeen: string | null;
    online: boolean;
    isLocked?: boolean;
    lockedUntil?: string | null;
    failedLoginCount?: number;
    lastFailedLoginAt?: string | null;
    forcePasswordChange?: boolean;
    bio: string | null;
  };
  stats: {
    totalPosts: number;
    totalPhotos: number;
    totalVideos: number;
    totalStories: number;
    friends: number;
    followers: number;
    following: number;
    communitiesJoined: number;
    eventsJoined: number;
    totalLikesReceived: number;
    totalCommentsReceived: number;
  };
  posts: Array<{
    id: string;
    caption: string | null;
    mediaUrl: string | null;
    mediaKind: string;
    createdAt: string;
    deletedAt: string | null;
    likes: number;
    comments: number;
    shares: number;
    reportCount: number;
    author: { name: string; profilePhotoUrl: string | null };
  }>;
  stories: Array<{
    id: string;
    mediaUrl: string;
    caption: string | null;
    expiresAt: string;
    createdAt: string;
    reportCount: number;
  }>;
  comments: Array<{ id: string; body: string; createdAt: string; postId: string | null }>;
  reports: Array<{
    id: string;
    reason: string;
    details: string | null;
    status: string;
    createdAt: string;
    reporter: { name: string; regNo: string };
  }>;
  activity: {
    lastLoginAt: string | null;
    accountCreationDate: string;
    loginDevices: Array<{
      id: string;
      deviceLabel: string | null;
      userAgent: string | null;
      ipAddress: string | null;
      createdAt: string;
      revokedAt: string | null;
      active: boolean;
    }>;
    recentLogins?: Array<{
      id: string;
      success: boolean;
      method: string | null;
      ipAddress: string | null;
      userAgent: string | null;
      reason: string | null;
      createdAt: string;
    }>;
    recentUploads: Array<{
      type: string;
      id: string;
      mediaUrl: string | null;
      caption: string | null;
      createdAt: string;
      deleted: boolean;
    }>;
    passwordResetHistory: Array<{
      id: string;
      adminName: string;
      timestamp: string;
      reason: string | null;
    }>;
    suspensions: Array<{
      id: string;
      action: string;
      adminName: string;
      timestamp: string;
      reason: string | null;
    }>;
    warningHistory: Array<{
      id: string;
      adminName: string;
      timestamp: string;
      reason: string;
    }>;
  };
  privacyNote: string;
}

interface Department {
  id: string;
  name: string;
}

function fmt(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleString();
}

const STAT_LABELS: Array<{ key: keyof StudentProfileData['stats']; label: string }> = [
  { key: 'totalPosts', label: 'Posts' },
  { key: 'totalPhotos', label: 'Photos' },
  { key: 'totalVideos', label: 'Videos' },
  { key: 'totalStories', label: 'Stories' },
  { key: 'friends', label: 'Friends' },
  { key: 'followers', label: 'Followers' },
  { key: 'following', label: 'Following' },
  { key: 'communitiesJoined', label: 'Communities' },
  { key: 'eventsJoined', label: 'Events' },
  { key: 'totalLikesReceived', label: 'Likes received' },
  { key: 'totalCommentsReceived', label: 'Comments received' },
];

export function StudentProfilePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<StudentProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [tempPw, setTempPw] = useState('');
  const [tab, setTab] = useState<TabId>('posts');
  const [editing, setEditing] = useState(false);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    mobile: '',
    departmentId: '',
    year: '',
  });
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetForm, setResetForm] = useState({
    password: '',
    confirmPassword: '',
    reason: 'Student forgot password',
  });
  const [resetting, setResetting] = useState(false);
  const [showForceConfirm, setShowForceConfirm] = useState(false);
  const [forceReason, setForceReason] = useState('Force password change on next login');

  const resetStrength = useMemo(
    () => isValidPasswordDetailed(resetForm.password),
    [resetForm.password],
  );

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const res = await api<StudentProfileData>(`/super-admin/students/${id}/profile`);
      if (!res.data) throw new Error('Profile not found');
      setData(res.data);
      setEditForm({
        name: res.data.profile.fullName,
        email: res.data.profile.collegeEmail,
        mobile: res.data.profile.mobile ?? '',
        departmentId: res.data.profile.departmentId,
        year: res.data.profile.year?.toString() ?? '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api<Department[]>('/super-admin/departments').then((res) => setDepartments(res.data ?? []));
  }, []);

  async function runAction(fn: () => Promise<void>, okMessage: string) {
    setError('');
    setMessage('');
    try {
      await fn();
      setMessage(okMessage);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  }

  async function submitResetPassword(e?: React.FormEvent) {
    e?.preventDefault();
    if (!id || !data) return;
    setError('');
    if (resetForm.password !== resetForm.confirmPassword) {
      setError('Temporary passwords do not match');
      return;
    }
    if (!resetStrength.valid) {
      setError(`Password requirements: ${resetStrength.errors.join(', ')}`);
      return;
    }
    setResetting(true);
    try {
      await runAction(async () => {
        await api(`/super-admin/students/${id}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({
            password: resetForm.password,
            confirmPassword: resetForm.confirmPassword,
            reason: resetForm.reason.trim() || 'Student forgot password',
          }),
        });
        setTempPw(resetForm.password);
        setShowResetDialog(false);
        setResetForm({
          password: '',
          confirmPassword: '',
          reason: 'Student forgot password',
        });
      }, 'Temporary password set. Student must change it on next login. Copy the password now — it is not stored in plain text.');
    } finally {
      setResetting(false);
    }
  }

  async function forcePasswordChange() {
    if (!id) return;
    await runAction(async () => {
      await api(`/super-admin/students/${id}/force-password-change`, {
        method: 'POST',
        body: JSON.stringify({ reason: forceReason.trim() || undefined }),
      });
      setShowForceConfirm(false);
    }, 'Student must change password on next login. All sessions revoked.');
  }

  async function lockAccount() {
    if (!id) return;
    const reason = window.prompt('Lock reason', 'Security review') ?? '';
    if (!reason.trim()) return;
    await runAction(
      () =>
        api(`/super-admin/students/${id}/lock`, {
          method: 'POST',
          body: JSON.stringify({ reason, durationMinutes: 24 * 60 }),
        }).then(() => undefined),
      'Account locked for 24 hours. All sessions revoked.',
    );
  }

  async function suspend() {
    if (!id) return;
    const reason = window.prompt('Suspension reason', 'Misconduct') ?? '';
    if (!reason.trim()) return;
    await runAction(
      () =>
        api(`/super-admin/students/${id}/suspend`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }).then(() => undefined),
      'Account suspended',
    );
  }

  async function activate() {
    if (!id) return;
    await runAction(
      () => api(`/super-admin/students/${id}/activate`, { method: 'POST' }).then(() => undefined),
      'Account activated',
    );
  }

  async function unlockAccount() {
    if (!id) return;
    await runAction(
      () =>
        api(`/super-admin/students/${id}/unlock`, {
          method: 'POST',
          body: JSON.stringify({ reason: 'Admin unlock from student profile' }),
        }).then(() => undefined),
      'Account unlocked — failed attempts cleared',
    );
  }

  async function deleteAccount() {
    if (!id || !data) return;
    if (!window.confirm(`Soft-delete ${data.profile.fullName} (${data.profile.regNo})?`)) return;
    const reason = window.prompt('Deletion reason', 'Admin deletion') ?? 'Admin deletion';
    await runAction(async () => {
      await api(`/super-admin/students/${id}?reason=${encodeURIComponent(reason)}`, {
        method: 'DELETE',
      });
      navigate('/students');
    }, 'Account deleted');
  }

  async function warnStudent() {
    if (!id) return;
    const reason = window.prompt('Warning reason (required)', '') ?? '';
    if (!reason.trim()) return;
    await runAction(
      () =>
        api(`/super-admin/students/${id}/warn`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }).then(() => undefined),
      'Warning recorded in audit log',
    );
  }

  async function banStudent(reasonPrompt = 'Banned for policy violation') {
    if (!id || !data) return;
    if (!window.confirm(`Ban ${data.profile.fullName}? This deactivates the account.`)) return;
    const reason = window.prompt('Ban reason (required)', reasonPrompt) ?? '';
    if (!reason.trim()) return;
    await runAction(
      () =>
        api(`/super-admin/students/${id}/ban`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
        }).then(() => undefined),
      'Student banned',
    );
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    await runAction(async () => {
      await api(`/super-admin/students/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          email: editForm.email,
          mobile: editForm.mobile || undefined,
          departmentId: editForm.departmentId || undefined,
          year: editForm.year ? Number(editForm.year) : null,
        }),
      });
      setEditing(false);
    }, 'Student updated');
  }

  async function hidePost(postId: string) {
    await runAction(
      () =>
        api(`/super-admin/posts/${postId}/delete`, { method: 'POST' }).then(() => undefined),
      'Post hidden (soft-deleted)',
    );
  }

  async function restorePost(postId: string) {
    await runAction(
      () => api(`/super-admin/posts/${postId}/restore`, { method: 'POST' }).then(() => undefined),
      'Post restored',
    );
  }

  async function deletePost(postId: string) {
    if (!window.confirm('Hide this post from the feed?')) return;
    await hidePost(postId);
  }

  async function removeStory(storyId: string) {
    if (!window.confirm('Remove this story permanently?')) return;
    await runAction(
      () => api(`/super-admin/stories/${storyId}`, { method: 'DELETE' }).then(() => undefined),
      'Story removed',
    );
  }

  async function closeReport(reportId: string) {
    await runAction(
      () =>
        api(`/super-admin/reports/${reportId}/resolve`, {
          method: 'POST',
          body: JSON.stringify({ status: 'CLOSED', action: 'none', adminNotes: 'Closed from student profile' }),
        }).then(() => undefined),
      'Report closed',
    );
  }

  async function resolveReportAction(
    reportId: string,
    action: 'warn' | 'suspend_user' | 'delete_post' | 'none',
  ) {
    await runAction(
      () =>
        api(`/super-admin/reports/${reportId}/resolve`, {
          method: 'POST',
          body: JSON.stringify({
            status: action === 'none' ? 'CLOSED' : 'ACTIONED',
            action,
            adminNotes: `Action from student profile: ${action}`,
          }),
        }).then(() => undefined),
      'Report action applied',
    );
  }

  if (loading) {
    return <div className="h-64 animate-pulse rounded-[28px] bg-slate-100" />;
  }

  if (!data) {
    return (
      <div className="space-y-4">
        <Link to="/students" className="inline-flex items-center gap-2 text-sm text-primary">
          <ArrowLeft size={16} /> Back to students
        </Link>
        <p className="text-error">{error || 'Student not found'}</p>
      </div>
    );
  }

  const p = data.profile;
  const tabs: Array<{ id: TabId; label: string; count?: number }> = [
    { id: 'posts', label: 'Posts', count: data.posts.length },
    { id: 'stories', label: 'Stories', count: data.stories.length },
    { id: 'comments', label: 'Comments', count: data.comments.length },
    { id: 'reports', label: 'Reports', count: data.reports.length },
    { id: 'activity', label: 'Activity' },
    { id: 'security', label: 'Security' },
  ];

  return (
    <div className="w-full min-w-0 space-y-4 sm:space-y-6">
      <Link to="/students" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary">
        <ArrowLeft size={16} /> Student Management
      </Link>

      {message ? (
        <div className="rounded-[20px] bg-success/10 px-4 py-3 text-sm text-success">
          {message}
          {tempPw ? (
            <p className="mt-1 font-mono text-slate-800">
              Temporary password (shown once): <strong>{tempPw}</strong>
            </p>
          ) : null}
        </div>
      ) : null}
      {error ? <p className="rounded-[20px] bg-error/10 px-4 py-3 text-sm text-error">{error}</p> : null}

      {/* Header */}
      <div className="glass-card overflow-hidden rounded-[28px] shadow-soft">
        <div
          className="relative h-36 bg-gradient-to-r from-primary via-indigo-500 to-violet-600"
          style={
            p.coverPhotoUrl
              ? { backgroundImage: `url(${p.coverPhotoUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
              : undefined
          }
        />
        <div className="relative px-5 pb-5 pt-0 sm:px-8">
          <div className="-mt-14 flex flex-wrap items-end gap-4">
            <div className="h-28 w-28 overflow-hidden rounded-full border-4 border-white bg-slate-200 shadow-md">
              {p.profilePhotoUrl ? (
                <img src={p.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-primary/15 text-2xl font-bold text-primary">
                  {p.fullName.slice(0, 1).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">{p.fullName}</h1>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    p.accountStatus === 'ACTIVE' ? 'bg-success/15 text-success' : 'bg-error/15 text-error'
                  }`}
                >
                  {p.accountStatus}
                </span>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {p.verificationStatus}
                </span>
                {p.forcePasswordChange ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    Must change password
                  </span>
                ) : null}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    p.online ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {p.online ? 'Online' : 'Offline'}
                </span>
              </div>
              <p className="mt-1 font-mono text-sm text-slate-500">{p.regNo}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
            <p>
              <span className="text-slate-400">Department:</span> {p.department}
            </p>
            <p>
              <span className="text-slate-400">Year:</span> {p.year ?? '—'}
            </p>
            <p>
              <span className="text-slate-400">College email:</span> {p.collegeEmail}
            </p>
            <p>
              <span className="text-slate-400">Mobile:</span> {p.mobile ?? '—'}
            </p>
            <p>
              <span className="text-slate-400">Join date:</span> {fmt(p.joinDate)}
            </p>
            <p>
              <span className="text-slate-400">Last login:</span> {fmt(p.lastLoginAt)}
            </p>
            <p>
              <span className="text-slate-400">Login lock:</span>{' '}
              {p.isLocked ? (
                <span className="font-medium text-error">Locked until {fmt(p.lockedUntil ?? null)}</span>
              ) : (
                <span className="text-success">Not locked</span>
              )}
              {(p.failedLoginCount ?? 0) > 0 ? ` · ${p.failedLoginCount} failed attempt(s)` : ''}
            </p>
            {p.lastFailedLoginAt ? (
              <p>
                <span className="text-slate-400">Last failed login:</span> {fmt(p.lastFailedLoginAt)}
              </p>
            ) : null}
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary"
            >
              <Pencil size={12} /> Edit Student
            </button>
            <button
              type="button"
              onClick={() => {
                setShowResetDialog(true);
                setError('');
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium"
            >
              <KeyRound size={12} /> Reset Password
            </button>
            <button
              type="button"
              onClick={() => setShowForceConfirm(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900"
            >
              <ShieldCheck size={12} /> Force Password Change
            </button>
            <button
              type="button"
              onClick={() => setTab('security')}
              className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-3 py-1.5 text-xs font-medium text-indigo-800"
            >
              <Lock size={12} /> Security Tab
            </button>
            {p.isLocked ? (
              <button
                type="button"
                onClick={() => void unlockAccount()}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800"
              >
                <UserCheck size={12} /> Unlock Account
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void lockAccount()}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1.5 text-xs font-medium text-white"
              >
                <Lock size={12} /> Lock Account
              </button>
            )}
            {(p.failedLoginCount ?? 0) > 0 && !p.isLocked ? (
              <button
                type="button"
                onClick={() => void unlockAccount()}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800"
              >
                <UserCheck size={12} /> Clear Failed Logins
              </button>
            ) : null}
            {p.accountStatus === 'ACTIVE' ? (
              <button
                type="button"
                onClick={suspend}
                className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-3 py-1.5 text-xs font-medium text-warning"
              >
                <UserX size={12} /> Suspend Account
              </button>
            ) : (
              <button
                type="button"
                onClick={activate}
                className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-xs font-medium text-success"
              >
                <UserCheck size={12} /> Activate Account
              </button>
            )}
            <button
              type="button"
              onClick={deleteAccount}
              className="inline-flex items-center gap-1.5 rounded-full bg-error/10 px-3 py-1.5 text-xs font-medium text-error"
            >
              <Trash2 size={12} /> Delete Account
            </button>
            <button
              type="button"
              onClick={warnStudent}
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800"
            >
              <MessageSquareWarning size={12} /> Send Warning
            </button>
            <button
              type="button"
              onClick={() => setTab('reports')}
              className="inline-flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-1.5 text-xs font-medium text-violet-800"
            >
              <ShieldAlert size={12} /> View Reports
            </button>
          </div>

          {editing ? (
            <form onSubmit={saveEdit} className="mt-5 space-y-3 rounded-[20px] border border-slate-200 bg-white/80 p-4">
              <h2 className="font-semibold">Edit student</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  label="Full name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
                <Input
                  label="College email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  required
                />
                <Input
                  label="Mobile"
                  value={editForm.mobile}
                  onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })}
                />
                <Input
                  label="Year"
                  type="number"
                  value={editForm.year}
                  onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                />
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-slate-600">Department</span>
                  <select
                    className="min-h-12 w-full rounded-[20px] border border-slate-200 bg-white px-4 text-sm"
                    value={editForm.departmentId}
                    onChange={(e) => setEditForm({ ...editForm, departmentId: e.target.value })}
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex gap-2">
                <Button type="submit" className="w-auto">
                  Save changes
                </Button>
                <Button type="button" variant="secondary" className="w-auto" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      </div>

      {/* Stats */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Profile statistics</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {STAT_LABELS.map(({ key, label }) => (
            <div key={key} className="glass-card rounded-[20px] p-4 text-center shadow-soft">
              <p className="text-2xl font-bold text-slate-900">{data.stats[key]}</p>
              <p className="mt-1 text-xs text-slate-500">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${
              tab === t.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {t.label}
            {t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {tab === 'posts' ? (
        <div className="space-y-3">
          {data.posts.length === 0 ? (
            <p className="text-slate-500">No posts from this student.</p>
          ) : (
            data.posts.map((post) => (
              <div
                key={post.id}
                className={`glass-card rounded-[24px] p-5 shadow-soft ${post.deletedAt ? 'opacity-60' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-200">
                    {post.author.profilePhotoUrl ? (
                      <img src={post.author.profilePhotoUrl} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{post.author.name}</p>
                      <p className="text-xs text-slate-400">{fmt(post.createdAt)}</p>
                      {post.deletedAt ? (
                        <span className="rounded-full bg-error/10 px-2 py-0.5 text-[10px] font-medium text-error">
                          Hidden
                        </span>
                      ) : null}
                    </div>
                    {post.caption ? <p className="mt-2 text-sm text-slate-700">{post.caption}</p> : null}
                    {post.mediaUrl ? (
                      <div className="mt-3 overflow-hidden rounded-2xl bg-slate-100">
                        {post.mediaKind === 'video' ? (
                          <video src={post.mediaUrl} controls className="max-h-80 w-full object-contain" />
                        ) : (
                          <img src={post.mediaUrl} alt="" className="max-h-80 w-full object-contain" />
                        )}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
                      <span>{post.likes} likes</span>
                      <span>{post.comments} comments</span>
                      <span>{post.shares} shares</span>
                      <span className={post.reportCount ? 'font-medium text-error' : ''}>
                        {post.reportCount} reports
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {!post.deletedAt ? (
                        <>
                          <button
                            type="button"
                            onClick={() => deletePost(post.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-error/10 px-3 py-1 text-xs font-medium text-error"
                          >
                            <Trash2 size={12} /> Delete Post
                          </button>
                          <button
                            type="button"
                            onClick={() => hidePost(post.id)}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium"
                          >
                            <EyeOff size={12} /> Hide Post
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => restorePost(post.id)}
                          className="inline-flex items-center gap-1 rounded-full bg-success/15 px-3 py-1 text-xs font-medium text-success"
                        >
                          <RotateCcw size={12} /> Restore Post
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'stories' ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.stories.length === 0 ? (
            <p className="text-slate-500">No active stories.</p>
          ) : (
            data.stories.map((s) => (
              <div key={s.id} className="glass-card overflow-hidden rounded-[24px] shadow-soft">
                <div className="aspect-[9/16] max-h-72 bg-slate-900">
                  {/\.(mp4|webm|mov)/i.test(s.mediaUrl) ? (
                    <video src={s.mediaUrl} className="h-full w-full object-cover" controls />
                  ) : (
                    <img src={s.mediaUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="space-y-2 p-4">
                  {s.caption ? <p className="text-sm">{s.caption}</p> : null}
                  <p className="text-xs text-slate-400">Expires {fmt(s.expiresAt)}</p>
                  <p className={`text-xs ${s.reportCount ? 'text-error font-medium' : 'text-slate-500'}`}>
                    Reports: {s.reportCount}
                  </p>
                  <button
                    type="button"
                    onClick={() => removeStory(s.id)}
                    className="inline-flex items-center gap-1 rounded-full bg-error/10 px-3 py-1.5 text-xs font-medium text-error"
                  >
                    <Trash2 size={12} /> Remove Story
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'comments' ? (
        <div className="space-y-3">
          {data.comments.length === 0 ? (
            <div className="glass-card rounded-[24px] p-6 text-sm text-slate-500 shadow-soft">
              <p>No public comments on record for this student.</p>
              <p className="mt-2 text-xs text-slate-400">
                Comment moderation will appear here when post comments are available. Private chats are not shown.
              </p>
            </div>
          ) : (
            data.comments.map((c) => (
              <div key={c.id} className="glass-card rounded-[24px] p-4 shadow-soft">
                <p className="text-sm">{c.body}</p>
                <p className="mt-1 text-xs text-slate-400">{fmt(c.createdAt)}</p>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'reports' ? (
        <div className="space-y-3">
          {data.reports.length === 0 ? (
            <p className="text-slate-500">No reports against this student.</p>
          ) : (
            data.reports.map((r) => (
              <div key={r.id} className="glass-card rounded-[24px] p-5 shadow-soft">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{r.reason}</p>
                    <p className="text-sm text-slate-500">
                      Reporter: {r.reporter.name} ({r.reporter.regNo})
                    </p>
                    <p className="text-xs text-slate-400">
                      {fmt(r.createdAt)} · Status: {r.status}
                    </p>
                    {r.details ? <p className="mt-2 text-sm text-slate-600">{r.details}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {r.status === 'OPEN' || r.status === 'REVIEWING' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => closeReport(r.id)}
                          className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium"
                        >
                          Close Report
                        </button>
                        <button
                          type="button"
                          onClick={() => resolveReportAction(r.id, 'warn')}
                          className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800"
                        >
                          Warn Student
                        </button>
                        <button
                          type="button"
                          onClick={() => resolveReportAction(r.id, 'suspend_user')}
                          className="rounded-full bg-warning/15 px-3 py-1.5 text-xs font-medium text-warning"
                        >
                          Suspend Student
                        </button>
                        <button
                          type="button"
                          onClick={() => banStudent(`Banned from report ${r.reason}`)}
                          className="inline-flex items-center gap-1 rounded-full bg-error/10 px-3 py-1.5 text-xs font-medium text-error"
                        >
                          <Ban size={12} /> Ban Student
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-400">Resolved</span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === 'security' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="glass-card rounded-[24px] p-5 shadow-soft lg:col-span-2">
            <h3 className="flex items-center gap-2 font-semibold">
              <ShieldCheck size={18} className="text-primary" /> Security
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Passwords are stored as Argon2 hashes only. Super Admin never sees student passwords or
              hashes. Temporary passwords are shown once after reset for offline delivery.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <p className="text-xs text-slate-400">Force change on next login</p>
                <p className="mt-1 font-semibold text-slate-800">
                  {p.forcePasswordChange ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <p className="text-xs text-slate-400">Login lock</p>
                <p className="mt-1 font-semibold text-slate-800">
                  {p.isLocked ? `Until ${fmt(p.lockedUntil ?? null)}` : 'Not locked'}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <p className="text-xs text-slate-400">Failed attempts</p>
                <p className="mt-1 font-semibold text-slate-800">{p.failedLoginCount ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm">
                <p className="text-xs text-slate-400">Last login</p>
                <p className="mt-1 font-semibold text-slate-800">{fmt(p.lastLoginAt)}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                type="button"
                className="w-auto"
                onClick={() => {
                  setShowResetDialog(true);
                  setError('');
                }}
              >
                <KeyRound size={14} className="mr-1.5" /> Reset Password
              </Button>
              <Button type="button" variant="secondary" className="w-auto" onClick={() => setShowForceConfirm(true)}>
                Force Password Change on Next Login
              </Button>
              {p.accountStatus === 'ACTIVE' ? (
                <Button type="button" variant="secondary" className="w-auto" onClick={() => void suspend()}>
                  Suspend Account
                </Button>
              ) : (
                <Button type="button" variant="secondary" className="w-auto" onClick={() => void activate()}>
                  Activate Account
                </Button>
              )}
              {p.isLocked ? (
                <Button type="button" variant="secondary" className="w-auto" onClick={() => void unlockAccount()}>
                  Unlock Account
                </Button>
              ) : (
                <Button type="button" variant="secondary" className="w-auto" onClick={() => void lockAccount()}>
                  Lock Account
                </Button>
              )}
            </div>
          </section>

          <section className="glass-card rounded-[24px] p-5 shadow-soft">
            <h3 className="font-semibold">Login history</h3>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {(data.activity.recentLogins ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">No login history yet.</p>
              ) : (
                (data.activity.recentLogins ?? []).map((h) => (
                  <div key={h.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs">
                    <p className="font-medium text-slate-800">
                      {h.success ? (
                        <span className="text-success">Success</span>
                      ) : (
                        <span className="text-error">Failed</span>
                      )}
                      {h.method ? ` · ${h.method}` : ''}
                    </p>
                    <p className="text-slate-500">
                      {h.ipAddress ?? '—'} · {fmt(h.createdAt)}
                    </p>
                    {h.reason ? <p className="text-slate-400">{h.reason}</p> : null}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="glass-card rounded-[24px] p-5 shadow-soft">
            <h3 className="font-semibold">Password reset history</h3>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
              {data.activity.passwordResetHistory.length === 0 ? (
                <p className="text-sm text-slate-500">No admin password resets.</p>
              ) : (
                data.activity.passwordResetHistory.map((h) => (
                  <div key={h.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <p>
                      <strong>{h.adminName}</strong> · {fmt(h.timestamp)}
                    </p>
                    {h.reason ? <p className="text-slate-400">Reason: {h.reason}</p> : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}

      {tab === 'activity' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="glass-card rounded-[24px] p-5 shadow-soft">
            <h3 className="font-semibold">Account timeline</h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Created: {fmt(data.activity.accountCreationDate)}</li>
              <li>Last login: {fmt(data.activity.lastLoginAt)}</li>
              <li>Last seen: {fmt(p.lastSeen)}</li>
            </ul>
          </section>

          <section className="glass-card rounded-[24px] p-5 shadow-soft">
            <h3 className="font-semibold">Login devices</h3>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {data.activity.loginDevices.length === 0 ? (
                <p className="text-sm text-slate-500">No sessions on record.</p>
              ) : (
                data.activity.loginDevices.map((d) => (
                  <div key={d.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs">
                    <p className="font-medium text-slate-800">
                      {d.deviceLabel || d.userAgent?.slice(0, 60) || 'Unknown device'}
                      {d.active ? (
                        <span className="ml-2 text-success">Active</span>
                      ) : (
                        <span className="ml-2 text-slate-400">Revoked</span>
                      )}
                    </p>
                    <p className="text-slate-500">
                      {d.ipAddress ?? '—'} · {fmt(d.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="glass-card rounded-[24px] p-5 shadow-soft">
            <h3 className="font-semibold">Recent uploads</h3>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {data.activity.recentUploads.length === 0 ? (
                <p className="text-sm text-slate-500">No uploads.</p>
              ) : (
                data.activity.recentUploads.map((u) => (
                  <div key={`${u.type}-${u.id}`} className="flex items-center gap-3 text-xs">
                    <span className="rounded bg-slate-100 px-2 py-0.5 uppercase">{u.type}</span>
                    <span className="truncate text-slate-600">{u.caption || u.mediaUrl || u.id}</span>
                    <span className="shrink-0 text-slate-400">{fmt(u.createdAt)}</span>
                    {u.deleted ? <Eye size={12} className="text-error" /> : null}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="glass-card rounded-[24px] p-5 shadow-soft">
            <h3 className="font-semibold">Password reset history</h3>
            <div className="mt-3 space-y-2">
              {data.activity.passwordResetHistory.length === 0 ? (
                <p className="text-sm text-slate-500">No admin password resets.</p>
              ) : (
                data.activity.passwordResetHistory.map((h) => (
                  <div key={h.id} className="text-xs text-slate-600">
                    <p>
                      <strong>{h.adminName}</strong> · {fmt(h.timestamp)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="glass-card rounded-[24px] p-5 shadow-soft">
            <h3 className="font-semibold">Suspensions</h3>
            <div className="mt-3 space-y-2">
              {data.activity.suspensions.length === 0 ? (
                <p className="text-sm text-slate-500">No suspension history.</p>
              ) : (
                data.activity.suspensions.map((h) => (
                  <div key={h.id} className="text-xs text-slate-600">
                    <p>
                      <strong>{h.action}</strong> by {h.adminName} · {fmt(h.timestamp)}
                    </p>
                    {h.reason ? <p className="text-slate-400">Reason: {h.reason}</p> : null}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="glass-card rounded-[24px] p-5 shadow-soft">
            <h3 className="font-semibold">Warning history</h3>
            <div className="mt-3 space-y-2">
              {data.activity.warningHistory.length === 0 ? (
                <p className="text-sm text-slate-500">No warnings.</p>
              ) : (
                data.activity.warningHistory.map((h) => (
                  <div key={h.id} className="text-xs text-slate-600">
                    <p>
                      <strong>{h.adminName}</strong> · {fmt(h.timestamp)}
                    </p>
                    <p className="text-slate-400">Reason: {h.reason}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      ) : null}

      <p className="rounded-[20px] border border-dashed border-slate-200 px-4 py-3 text-xs text-slate-400">
        {data.privacyNote}
      </p>

      {/* Reset password dialog */}
      {showResetDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div
            className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl"
            role="dialog"
            aria-labelledby="reset-pw-title"
          >
            <h2 id="reset-pw-title" className="text-lg font-bold text-slate-900">
              Reset temporary password
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {p.fullName} · <span className="font-mono">{p.regNo}</span>
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Sets a temporary password, forces change on next login, revokes all sessions, and writes
              an audit log. The password is never stored in plain text.
            </p>
            <form onSubmit={(e) => void submitResetPassword(e)} className="mt-4 space-y-3">
              <Input
                label="New temporary password"
                type="password"
                value={resetForm.password}
                onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })}
                placeholder="Temp@4582"
                required
              />
              {resetForm.password ? (
                <ul className="space-y-0.5 text-xs">
                  {resetStrength.errors.map((err) => (
                    <li key={err} className="text-error">
                      • {err}
                    </li>
                  ))}
                  {resetStrength.valid ? (
                    <li className="text-success">• Meets requirements</li>
                  ) : null}
                </ul>
              ) : null}
              <Input
                label="Confirm temporary password"
                type="password"
                value={resetForm.confirmPassword}
                onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })}
                required
              />
              <Input
                label="Reason (audit log)"
                value={resetForm.reason}
                onChange={(e) => setResetForm({ ...resetForm, reason: e.target.value })}
              />
              <div className="flex flex-wrap gap-2 pt-2">
                <Button type="submit" loading={resetting} className="w-auto">
                  Reset Password
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-auto"
                  onClick={() => setShowResetDialog(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Force password change confirmation */}
      {showForceConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl" role="dialog">
            <h2 className="text-lg font-bold text-slate-900">Force password change?</h2>
            <p className="mt-2 text-sm text-slate-600">
              {p.fullName} ({p.regNo}) will be required to create a new password on next login. All
              active sessions will be revoked. Their current password still works until they change
              it.
            </p>
            <div className="mt-4">
              <Input
                label="Reason (optional)"
                value={forceReason}
                onChange={(e) => setForceReason(e.target.value)}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" className="w-auto" onClick={() => void forcePasswordChange()}>
                Confirm
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-auto"
                onClick={() => setShowForceConfirm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
