import { motion, type HTMLMotionProps } from 'framer-motion';
import type { ReactNode } from 'react';

type ButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  loading?: boolean;
} & Omit<HTMLMotionProps<'button'>, 'children'>;

export function Button({
  children,
  variant = 'primary',
  loading,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const variants = {
    primary: 'bg-primary text-white shadow-float hover:bg-primary/90',
    secondary: 'bg-white text-primary border border-primary/20 shadow-soft',
    ghost: 'bg-transparent text-primary hover:bg-primary/5',
  };

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className={`min-h-11 w-full rounded-[22px] px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 sm:min-h-12 sm:px-6 sm:py-3 sm:text-base ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? 'Please wait…' : children}
    </motion.button>
  );
}
