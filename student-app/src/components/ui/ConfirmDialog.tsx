import { Button } from './Button';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  loading,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useBodyScrollLock(open);
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center overflow-y-auto bg-black/50 p-0 sm:items-center sm:p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="modal-sheet modal-sheet-mobile-bottom w-full rounded-t-[1.5rem] bg-white p-5 shadow-float sm:rounded-[24px] sm:p-6 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" aria-hidden />
        <h2 id="confirm-dialog-title" className="text-fluid-lg font-bold text-slate-900 dark:text-white">
          {title}
        </h2>
        <p className="mt-2 text-fluid-sm break-anywhere text-slate-600 dark:text-slate-300">{message}</p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <Button type="button" variant="secondary" className="min-h-11 flex-1" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            className={`min-h-11 flex-1 ${danger ? 'bg-error hover:bg-error/90' : ''}`}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
