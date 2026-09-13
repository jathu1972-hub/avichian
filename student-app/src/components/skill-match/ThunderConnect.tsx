import { useEffect, useState } from 'react';

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

type Point = { x: number; y: number };

function jaggedPath(from: Point, to: Point): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const mid = { x: from.x + dx * 0.5, y: from.y + dy * 0.5 };
  const nx = -dy;
  const ny = dx;
  const len = Math.max(1, Math.hypot(nx, ny));
  const offset = 10;
  const jx = (nx / len) * offset;
  const jy = (ny / len) * offset;
  const p1 = { x: from.x + dx * 0.28 + jx * 0.4, y: from.y + dy * 0.28 + jy * 0.4 };
  const p2 = { x: mid.x - jx, y: mid.y - jy };
  const p3 = { x: from.x + dx * 0.72 + jx * 0.35, y: from.y + dy * 0.72 + jy * 0.35 };
  return `M ${from.x} ${from.y} L ${p1.x} ${p1.y} L ${p2.x} ${p2.y} L ${p3.x} ${p3.y} L ${to.x} ${to.y}`;
}

export function ThunderBolt({
  from,
  to,
  reduced,
}: {
  from: Point;
  to: Point;
  reduced: boolean;
}) {
  if (reduced) return null;
  const d = jaggedPath(from, to);
  return (
    <svg
      className="pointer-events-none fixed inset-0 z-[80] h-full w-full"
      viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
      aria-hidden
    >
      <defs>
        <filter id="sm-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <path
        d={d}
        className="skill-thunder-line"
        fill="none"
        stroke="rgba(16,185,129,0.28)"
        strokeWidth="4"
        strokeLinecap="round"
        filter="url(#sm-glow)"
      />
      <path
        d={d}
        className="skill-thunder-line"
        fill="none"
        stroke="rgba(167,243,208,0.95)"
        strokeWidth="1.15"
        strokeLinecap="round"
      />
    </svg>
  );
}
