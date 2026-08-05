import { FileText, ImageOff, Play } from 'lucide-react';
import { useMemo, useState } from 'react';
import { resolveMediaUrl } from '../lib/config';

type Kind = 'image' | 'video' | 'pdf' | 'unknown';

function detectKind(url: string, mediaKind?: string | null): Kind {
  const k = (mediaKind ?? '').toLowerCase();
  if (k === 'video' || k.includes('video')) return 'video';
  if (k === 'image' || k.includes('image') || k === 'photo') return 'image';
  if (k === 'pdf' || k.includes('pdf')) return 'pdf';
  const path = url.split('?')[0]?.toLowerCase() ?? '';
  if (/\.(mp4|webm|mov|m4v|ogg)(\s*$)/i.test(path)) return 'video';
  if (/\.(png|jpe?g|gif|webp|avif|bmp|svg)(\s*$)/i.test(path)) return 'image';
  if (/\.pdf(\s*$)/i.test(path)) return 'pdf';
  if (url.startsWith('data:video')) return 'video';
  if (url.startsWith('data:image')) return 'image';
  if (url.startsWith('data:application/pdf')) return 'pdf';
  // Local media API paths are usually images/videos under /api/media
  if (path.includes('/media/') || path.includes('/uploads/')) return 'image';
  return 'unknown';
}

interface MediaPreviewProps {
  url: string | null | undefined;
  mediaKind?: string | null;
  caption?: string | null;
  className?: string;
  /** thumbnail strip height */
  thumb?: boolean;
  /** open full modal on click */
  expandable?: boolean;
}

/**
 * Super Admin media preview — always resolves relative API paths to absolute URLs.
 * Handles image / video / PDF with fallbacks (fixes black screens).
 */
export function MediaPreview({
  url,
  mediaKind,
  caption,
  className = '',
  thumb = false,
  expandable = true,
}: MediaPreviewProps) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const resolved = useMemo(() => resolveMediaUrl(url) ?? url ?? null, [url]);
  const kind = resolved ? detectKind(resolved, mediaKind) : 'unknown';

  if (!resolved || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 rounded-2xl bg-slate-100 text-slate-400 ${
          thumb ? 'h-28 w-20' : 'min-h-[180px] w-full'
        } ${className}`}
      >
        <ImageOff size={thumb ? 18 : 28} />
        {!thumb ? <span className="text-xs">Media unavailable</span> : null}
      </div>
    );
  }

  const shell = (
    <div
      className={`overflow-hidden rounded-2xl bg-black ${thumb ? 'h-28 w-20' : 'w-full'} ${className}`}
    >
      {kind === 'video' ? (
        <div className="relative h-full w-full">
          <video
            src={resolved}
            className={`h-full w-full object-cover ${thumb ? '' : 'max-h-[480px] object-contain'}`}
            controls={!thumb}
            playsInline
            preload="metadata"
            muted={thumb}
            onError={() => setFailed(true)}
          />
          {thumb ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/25">
              <Play size={20} className="text-white" fill="currentColor" />
            </span>
          ) : null}
        </div>
      ) : kind === 'pdf' ? (
        thumb ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-slate-800 text-white">
            <FileText size={22} />
            <span className="text-[10px]">PDF</span>
          </div>
        ) : (
          <iframe title={caption || 'PDF'} src={resolved} className="h-[480px] w-full bg-white" />
        )
      ) : (
        <img
          src={resolved}
          alt={caption || 'Media'}
          className={`h-full w-full object-cover ${thumb ? '' : 'max-h-[480px] object-contain'}`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );

  if (!expandable) return shell;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block w-full text-left">
        {shell}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="relative max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            {kind === 'video' ? (
              <video
                src={resolved}
                className="max-h-[85vh] w-full bg-black"
                controls
                autoPlay
                playsInline
                preload="auto"
              />
            ) : kind === 'pdf' ? (
              <iframe title="PDF" src={resolved} className="h-[85vh] w-full bg-white" />
            ) : (
              <img src={resolved} alt="" className="max-h-[85vh] w-full object-contain" />
            )}
            {caption ? (
              <p className="bg-black/70 px-4 py-2 text-sm text-white">{caption}</p>
            ) : null}
            <button
              type="button"
              className="absolute right-3 top-3 rounded-full bg-white/20 px-3 py-1 text-sm text-white"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
