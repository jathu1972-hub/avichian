/**
 * App startup splash — shown while auth/config bootstrap runs.
 * This is the React-side of the same branding as index.html #avichian-boot-splash
 * (first paint before JS). Do not add artificial delays.
 */
export function SplashScreen() {
  return (
    <div
      className="flex min-h-dvh w-full flex-col items-center justify-center bg-zinc-950 px-6"
      role="status"
      aria-live="polite"
      aria-label="AVICHIAN is loading"
    >
      <div className="flex w-full max-w-xs flex-col items-center text-center">
        {/* AVICHIAN logo mark */}
        <div
          className="brand-mark flex h-[4.5rem] w-[4.5rem] items-center justify-center rounded-[1.35rem] text-[1.75rem] font-extrabold tracking-tight text-white shadow-float sm:h-20 sm:w-20 sm:text-3xl"
          aria-hidden
        >
          A
        </div>

        <h1 className="mt-6 font-display text-[1.65rem] font-extrabold tracking-tight text-zinc-50 sm:text-2xl">
          AVICHIAN
        </h1>

        {/* Secondary developer credit — smaller than brand */}
        <div className="mt-8 space-y-1">
          <p className="text-[11px] font-medium tracking-wide text-zinc-500">
            Designed &amp; Developed by
          </p>
          <p className="text-sm font-semibold tracking-tight text-zinc-300">Jathurshan</p>
        </div>

        <div
          className="mt-10 h-8 w-8 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary"
          aria-hidden
        />
      </div>
    </div>
  );
}
