import { motion } from 'framer-motion';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number | string;
  trend?: number;
  suffix?: string;
  accent?: string;
}

export function StatCard({ icon: Icon, label, value, trend, suffix, accent = 'text-primary' }: StatCardProps) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="glass-card rounded-[28px] p-5 shadow-soft"
    >
      <div className="flex items-start justify-between">
        <div className={`rounded-2xl bg-primary/10 p-3 ${accent}`}>
          <Icon size={22} />
        </div>
        {trend !== undefined ? (
          <span className={`text-xs font-semibold ${trend >= 0 ? 'text-success' : 'text-error'}`}>
            {trend >= 0 ? '+' : ''}
            {trend}%
          </span>
        ) : null}
      </div>
      <p className="mt-4 text-2xl font-bold text-slate-900">
        {value}
        {suffix ? <span className="text-sm font-normal text-slate-500">{suffix}</span> : null}
      </p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, Math.abs(trend ?? 50))}%` }}
          className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
        />
      </div>
    </motion.div>
  );
}