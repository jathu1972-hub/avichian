import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import {
  REPORT_REASONS,
  type ReportTargetType,
  blockUserSafety,
  muteUser,
  submitReport,
} from '../../lib/safety';
import { hidePost } from '../../lib/social';

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
  targetType: ReportTargetType;
  targetId: string;
  targetUserId?: string;
  onDone?: (msg: string) => void;
  /** When reporting a post, allow hide */
  allowHide?: boolean;
}

export function ReportDialog({
  open,
  onClose,
  targetType,
  targetId,
  targetUserId,
  onDone,
  allowHide,
}: ReportDialogProps) {
  const [step, setStep] = useState<'menu' | 'report'>('menu');
  const [reason, setReason] = useState('INAPPROPRIATE');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useBodyScrollLock(open);

  function reset() {
    setStep('menu');
    setReason('INAPPROPRIATE');
    setDetails('');
    setError('');
    setBusy(false);
  }

  function close() {
    reset();
    onClose();
  }

  async function sendReport() {
    setError('');
    if (reason === 'OTHER' && details.trim().length < 5) {
      setError('Please describe the issue (Other)');
      return;
    }
    setBusy(true);
    try {
      await submitReport({
        targetType,
        targetId,
        reason,
        details: details.trim() || undefined,
      });
      onDone?.('Report submitted. Our team will review it.');
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Report failed');
    } finally {
      setBusy(false);
    }
  }

  async function doBlock() {
    if (!targetUserId) {
      onDone?.('No user to block');
      return;
    }
    if (!window.confirm('Block this user? They will not be able to message or call you.')) return;
    setBusy(true);
    try {
      await blockUserSafety(targetUserId);
      onDone?.('User blocked');
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Block failed');
    } finally {
      setBusy(false);
    }
  }

  async function doMute() {
    if (!targetUserId) {
      onDone?.('No user to mute');
      return;
    }
    setBusy(true);
    try {
      await muteUser(targetUserId);
      onDone?.('User muted — their content is hidden for you');
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mute failed');
    } finally {
      setBusy(false);
    }
  }

  async function doHide() {
    if (targetType !== 'POST') return;
    setBusy(true);
    try {
      await hidePost(targetId);
      onDone?.('Content hidden from your feed');
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hide failed');
    } finally {
      setBusy(false);
    }
  }

  function copyLink() {
    const url = window.location.href;
    void navigator.clipboard.writeText(url).then(() => {
      onDone?.('Link copied');
      close();
    });
  }

  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'AVICHIAN', url });
      } catch {
        /* cancelled */
      }
    } else {
      copyLink();
      return;
    }
    close();
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={close}
        >
          <motion.div
            initial={{ y: 40 }}
            animate={{ y: 0 }}
            exit={{ y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white shadow-2xl dark:bg-slate-900 sm:rounded-[28px]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-amber-500" />
                <h2 className="font-bold dark:text-white">
                  {step === 'menu' ? 'More options' : 'Report'}
                </h2>
              </div>
              <button type="button" onClick={close} className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>

            {error ? (
              <p className="mx-5 mt-3 rounded-xl bg-error/10 px-3 py-2 text-sm text-error">{error}</p>
            ) : null}

            {step === 'menu' ? (
              <div className="space-y-1 p-3">
                <MenuBtn
                  label="Report"
                  danger
                  onClick={() => setStep('report')}
                />
                {targetUserId ? (
                  <>
                    <MenuBtn label="Block user" danger onClick={() => void doBlock()} disabled={busy} />
                    <MenuBtn label="Mute user" onClick={() => void doMute()} disabled={busy} />
                  </>
                ) : null}
                {allowHide && targetType === 'POST' ? (
                  <MenuBtn label="Hide content" onClick={() => void doHide()} disabled={busy} />
                ) : null}
                <MenuBtn label="Copy link" onClick={copyLink} />
                <MenuBtn label="Share" onClick={() => void share()} />
                <MenuBtn label="Cancel" onClick={close} />
              </div>
            ) : (
              <div className="space-y-4 p-5">
                <p className="text-sm text-slate-500">
                  Why are you reporting this {targetType.toLowerCase()}?
                </p>
                <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setReason(r.id)}
                      className={`rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition ${
                        reason === r.id
                          ? 'bg-primary text-white shadow-soft'
                          : 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                {(reason === 'OTHER' || details.length > 0) && (
                  <textarea
                    value={details}
                    onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
                    placeholder="Additional details (required for Other)…"
                    rows={3}
                    className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  />
                )}
                {reason !== 'OTHER' ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-primary"
                    onClick={() => setReason('OTHER')}
                  >
                    + Add details
                  </button>
                ) : null}
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void sendReport()}
                    className="flex-1 rounded-full bg-error py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {busy ? 'Submitting…' : 'Submit report'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep('menu')}
                    className="rounded-full bg-slate-100 px-4 py-3 text-sm font-semibold dark:bg-slate-800"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function MenuBtn({
  label,
  onClick,
  danger,
  disabled,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded-2xl px-4 py-3.5 text-left text-sm font-semibold transition hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-800 ${
        danger ? 'text-error' : 'text-slate-800 dark:text-slate-100'
      }`}
    >
      {label}
    </button>
  );
}
