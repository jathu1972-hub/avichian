import { motion } from 'framer-motion';
import {
  Clapperboard,
  ImagePlus,
  Sparkles,
  X,
  CircleDot,
  ChevronRight,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

const options = [
  {
    id: 'post',
    title: 'Post',
    description: 'Share photos, videos & captions with campus',
    to: '/home/create/post',
    icon: ImagePlus,
    gradient: 'from-sky-500 via-blue-500 to-indigo-600',
    glow: 'shadow-sky-500/25',
    chip: 'Feed',
    delay: 0.05,
  },
  {
    id: 'reel',
    title: 'Reel',
    description: 'Create short vertical video content',
    to: '/home/create/reel',
    icon: Clapperboard,
    gradient: 'from-fuchsia-500 via-rose-500 to-orange-400',
    glow: 'shadow-rose-500/30',
    chip: 'Video',
    delay: 0.12,
  },
  {
    id: 'story',
    title: 'Story',
    description: 'Moments that disappear after 24 hours',
    to: '/home/create/story',
    icon: CircleDot,
    gradient: 'from-violet-500 via-purple-500 to-pink-500',
    glow: 'shadow-violet-500/30',
    chip: '24h',
    delay: 0.19,
  },
] as const;

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.07, delayChildren: 0.08 },
  },
};

const item = {
  hidden: { opacity: 0, y: 28, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 380, damping: 28 },
  },
};

export function CreateHubPage() {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="relative mx-auto flex w-full max-w-lg flex-col rounded-[32px] border border-white/50 bg-gradient-to-b from-white/90 via-slate-50/80 to-primary/[0.07] p-1 shadow-float backdrop-blur-2xl dark:border-slate-700/60 dark:from-slate-900/95 dark:via-slate-900/90 dark:to-violet-950/40"
    >
      {/* Ambient orbs */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-fuchsia-400/15 blur-3xl"
        aria-hidden
      />

      <header className="relative z-10 flex items-start justify-between gap-3 px-5 pb-2 pt-5 sm:px-6 sm:pt-6">
        <div>
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary">
            <Sparkles size={12} />
            Share
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
            Create
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Choose what you want to share
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-soft transition hover:bg-white active:scale-95 dark:bg-slate-800 dark:text-slate-300"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </header>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 flex flex-1 flex-col gap-3 px-4 pb-4 sm:px-5 sm:pb-5"
      >
        {options.map((opt) => {
          const Icon = opt.icon;
          return (
            <motion.div key={opt.id} variants={item}>
              <Link
                to={opt.to}
                className="group relative block overflow-hidden rounded-[26px] outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                <motion.div
                  whileHover={{ scale: 1.015, y: -2 }}
                  whileTap={{ scale: 0.985 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                  className={`relative flex items-center gap-4 bg-gradient-to-r ${opt.gradient} p-[1.5px] shadow-xl ${opt.glow}`}
                  style={{ borderRadius: 26 }}
                >
                  <div className="flex w-full items-center gap-4 rounded-[24.5px] bg-white/95 px-4 py-4 backdrop-blur-xl dark:bg-slate-950/90 sm:px-5 sm:py-5">
                    <div
                      className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${opt.gradient} text-white shadow-lg sm:h-16 sm:w-16`}
                    >
                      <motion.span
                        animate={{ y: [0, -3, 0] }}
                        transition={{
                          duration: 2.2,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: opt.delay,
                        }}
                      >
                        <Icon size={28} strokeWidth={2.2} />
                      </motion.span>
                      <span className="absolute inset-0 rounded-2xl bg-white/10 opacity-0 transition group-hover:opacity-100" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white sm:text-xl">
                          {opt.title}
                        </h2>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {opt.chip}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm leading-snug text-slate-500 dark:text-slate-400">
                        {opt.description}
                      </p>
                    </div>

                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-primary group-hover:text-white dark:bg-slate-800">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </motion.div>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>

      <div className="relative z-10 border-t border-slate-100/80 px-5 py-4 dark:border-slate-800/80">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-full rounded-full bg-slate-100 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 active:scale-[0.99] dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          Cancel
        </button>
        <p className="mt-3 text-center text-[11px] text-slate-400">
          Your content is saved to campus storage · real PostgreSQL only
        </p>
      </div>
    </motion.div>
  );
}
