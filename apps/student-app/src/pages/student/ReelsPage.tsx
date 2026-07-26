import { useCallback, useEffect, useState } from 'react';
import { Heart } from 'lucide-react';
import {
  archiveReel,
  deleteReel,
  fetchReels,
  hideReel,
  reportReel,
  toggleReelLike,
  updateReel,
  type ReelItem,
} from '../../lib/social';
import { StudentAvatar } from '../../components/student/StudentAvatar';
import { ContentMenu } from '../../components/student/ContentMenu';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Link } from 'react-router-dom';

export function ReelsPage() {
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setReels(await fetchReels());
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Failed to load reels');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function handleDelete() {
    if (!deleteId) return;
    setBusy(true);
    try {
      await deleteReel(deleteId);
      setReels((prev) => prev.filter((r) => r.id !== deleteId));
      setToast('Reel deleted successfully.');
    } catch (err) {
      setToast(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusy(false);
      setDeleteId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-10 w-10 animate-pulse rounded-full bg-slate-200" />
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="glass-card rounded-[28px] p-8 text-center shadow-soft">
        <p className="font-semibold text-slate-900">No reels yet</p>
        <p className="mt-1 text-sm text-slate-500">Upload a short video as a reel from Create.</p>
        <Link
          to="/home/create?type=reel"
          className="mt-4 inline-block rounded-full bg-primary px-4 py-2 text-sm font-medium text-white"
        >
          Create reel
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Reels</h1>
        <Link to="/home/create?type=reel" className="text-sm font-medium text-primary">
          New reel
        </Link>
      </div>

      {toast ? (
        <p className="rounded-[20px] bg-success/10 px-4 py-2 text-sm text-success">{toast}</p>
      ) : null}

      {reels.map((reel) => (
        <article key={reel.id} className="glass-card overflow-hidden rounded-[28px] shadow-soft">
          <div className="flex items-center gap-3 p-4">
            <StudentAvatar name={reel.author.name} photoUrl={reel.author.profilePhotoUrl} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{reel.author.name}</p>
              <p className="text-xs text-slate-500">{new Date(reel.createdAt).toLocaleString()}</p>
            </div>
            <ContentMenu
              actions={
                reel.isMine
                  ? [
                      {
                        id: 'edit',
                        label: 'Edit Caption',
                        onClick: () => {
                          const caption = window.prompt('Caption', reel.caption ?? '') ?? '';
                          void updateReel(reel.id, { caption })
                            .then((u) => {
                              setReels((prev) => prev.map((r) => (r.id === u.id ? u : r)));
                              setToast('Caption updated.');
                            })
                            .catch((e) => setToast(e instanceof Error ? e.message : 'Update failed'));
                        },
                      },
                      {
                        id: 'cover',
                        label: 'Change Cover Image',
                        onClick: () => setToast('Upload a cover via edit after posting a cover URL in a future update.'),
                      },
                      {
                        id: 'delete',
                        label: 'Delete Reel',
                        danger: true,
                        onClick: () => setDeleteId(reel.id),
                      },
                      {
                        id: 'archive',
                        label: 'Archive Reel',
                        onClick: () => {
                          void archiveReel(reel.id)
                            .then(() => {
                              setReels((prev) => prev.filter((r) => r.id !== reel.id));
                              setToast('Reel archived.');
                            })
                            .catch((e) => setToast(e instanceof Error ? e.message : 'Archive failed'));
                        },
                      },
                      {
                        id: 'copy',
                        label: 'Copy Link',
                        onClick: () => {
                          void navigator.clipboard.writeText(
                            `${window.location.origin}/home/reels?id=${reel.id}`,
                          );
                          setToast('Link copied.');
                        },
                      },
                      {
                        id: 'share',
                        label: 'Share',
                        onClick: () => {
                          const url = `${window.location.origin}/home/reels?id=${reel.id}`;
                          if (navigator.share) void navigator.share({ title: 'AVICHIAN reel', url });
                          else void navigator.clipboard.writeText(url);
                        },
                      },
                    ]
                  : [
                      {
                        id: 'report',
                        label: 'Report Reel',
                        danger: true,
                        onClick: () => {
                          const reason = window.prompt('Reason', 'INAPPROPRIATE');
                          if (!reason) return;
                          void reportReel(reel.id, reason.toUpperCase())
                            .then(() => setToast('Report submitted.'))
                            .catch((e) => setToast(e instanceof Error ? e.message : 'Report failed'));
                        },
                      },
                      {
                        id: 'hide',
                        label: 'Hide Reel',
                        onClick: () => {
                          void hideReel(reel.id)
                            .then(() => {
                              setReels((prev) => prev.filter((r) => r.id !== reel.id));
                              setToast('Reel hidden.');
                            })
                            .catch((e) => setToast(e instanceof Error ? e.message : 'Hide failed'));
                        },
                      },
                      {
                        id: 'copy',
                        label: 'Copy Link',
                        onClick: () => {
                          void navigator.clipboard.writeText(
                            `${window.location.origin}/home/reels?id=${reel.id}`,
                          );
                          setToast('Link copied.');
                        },
                      },
                      {
                        id: 'share',
                        label: 'Share',
                        onClick: () => {
                          const url = `${window.location.origin}/home/reels?id=${reel.id}`;
                          if (navigator.share) void navigator.share({ title: 'AVICHIAN reel', url });
                        },
                      },
                    ]
              }
            />
          </div>

          <video
            src={reel.mediaUrl}
            poster={reel.coverUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="max-h-[70vh] w-full bg-black object-contain"
          />

          <div className="space-y-2 p-4">
            {reel.caption ? <p className="text-sm text-slate-700">{reel.caption}</p> : null}
            <button
              type="button"
              className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                reel.likedByMe ? 'text-error' : 'text-slate-500'
              }`}
              onClick={() => {
                void toggleReelLike(reel.id).then((r) => {
                  setReels((prev) =>
                    prev.map((x) =>
                      x.id === reel.id
                        ? { ...x, likedByMe: r.liked, likeCount: r.likeCount }
                        : x,
                    ),
                  );
                });
              }}
            >
              <Heart size={18} fill={reel.likedByMe ? 'currentColor' : 'none'} />
              {reel.likeCount}
            </button>
          </div>
        </article>
      ))}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete this reel?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        loading={busy}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
