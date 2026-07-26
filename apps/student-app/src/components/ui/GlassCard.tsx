import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function GlassCard({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="glass-card rounded-[28px] p-6 shadow-soft"
    >
      {children}
    </motion.div>
  );
}