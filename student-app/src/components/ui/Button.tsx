import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

type ButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg';
} & Omit<HTMLMotionProps<'button'>, 'children'>;

export function Button({
  children,
  variant = 'primary',
  loading,
  size = 'md',
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const variants = {
    primary:
      'bg-gradient-to-br from-primary to-secondary text-white shadow-float hover:brightness-105 active:brightness-95',
    secondary:
      'bg-white/90 text-primary border border-primary/15 shadow-soft hover:bg-primary/5 dark:bg-zinc-900 dark:border-zinc-700',
    ghost: 'bg-transparent text-primary hover:bg-primary/8',
    soft: 'bg-primary/10 text-primary hover:bg-primary/15 border border-primary/10',
    danger: 'bg-error text-white shadow-soft hover:bg-error/90',
  };

  const sizes = {
    sm: 'min-h-9 rounded-2xl px-3 py-1.5 text-xs sm:text-sm',
    md: 'min-h-11 rounded-[1.25rem] px-4 py-2.5 text-sm sm:min-h-12 sm:px-6 sm:text-base',
    lg: 'min-h-12 rounded-[1.35rem] px-6 py-3 text-base sm:min-h-14',
  };

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      whileHover={{ scale: disabled || loading ? 1 : 1.01 }}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
      className={`inline-flex w-full items-center justify-center gap-2 font-semibold tracking-tight transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          Please wait…
        </span>
      ) : (
        children
      )}
    </motion.button>
  );
}
