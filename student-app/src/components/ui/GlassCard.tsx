import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function GlassCard({
  children,
  className = '',
  elevated = false,
}: {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      className={`${elevated ? 'glass-elevated' : 'glass-card'} rounded-[1.75rem] p-5 sm:p-6 ${className}`}
    >
      {children}
    </motion.div>
  );
}
