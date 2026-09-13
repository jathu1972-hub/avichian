import { Zap } from 'lucide-react';
import type { MatchReason } from '../../types/skill-match';

export function WhyYouMatch({ reasons }: { reasons: MatchReason[] }) {
  if (!reasons.length) return null;
  return (
    <section className="space-y-3" aria-label="Why you match">
      <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
        <Zap size={14} className="text-emerald-300" aria-hidden />
        Why you match
      </h3>
      <ul className="space-y-2.5">
        {reasons.map((reason) => (
          <li key={`${reason.type}-${reason.title}`} className="rounded-2xl border border-white/6 bg-black/20 p-3">
            <p className="text-xs font-semibold text-emerald-200">{reason.title}</p>
            {reason.youBring?.length ? (
              <p className="mt-1.5 text-[12px] text-zinc-400">
                You bring:{' '}
                <span className="text-zinc-200">{reason.youBring.join(', ')}</span>
              </p>
            ) : null}
            {reason.theyBring?.length ? (
              <p className="text-[12px] text-zinc-400">
                They bring:{' '}
                <span className="text-zinc-200">{reason.theyBring.join(', ')}</span>
              </p>
            ) : null}
            {reason.goals?.length ? (
              <p className="text-[12px] text-zinc-400">
                Shared goal:{' '}
                <span className="text-zinc-200">{reason.goals.join(', ')}</span>
              </p>
            ) : null}
            {reason.items?.length ? (
              <p className="mt-1 text-[12px] text-zinc-300">{reason.items.join(' · ')}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
