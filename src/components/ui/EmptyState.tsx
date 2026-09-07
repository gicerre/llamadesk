import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { springBouncy, staggerContainer, staggerItem } from '@/lib/motion';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

/** Uno stato vuoto non è un'interfaccia rotta: è un invito ad agire. */
export function EmptyState({ icon, title, description, actions, className }: EmptyStateProps) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className={cn(
        'flex flex-col items-center justify-center gap-5 rounded-3xl px-8 py-16 text-center',
        'border border-dashed border-black/10 dark:border-white/10',
        className,
      )}
    >
      {icon && (
        <motion.div
          variants={staggerItem}
          transition={springBouncy}
          className={cn(
            'flex size-16 items-center justify-center rounded-2xl',
            'bg-black/[0.04] text-zinc-400 dark:bg-white/[0.06] dark:text-zinc-500',
          )}
        >
          {icon}
        </motion.div>
      )}
      <motion.div variants={staggerItem} className="flex max-w-md flex-col gap-2">
        <h3 className="text-lg font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
          {title}
        </h3>
        {description && (
          <p className="text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{description}</p>
        )}
      </motion.div>
      {actions && (
        <motion.div
          variants={staggerItem}
          className="flex flex-wrap items-center justify-center gap-3"
        >
          {actions}
        </motion.div>
      )}
    </motion.div>
  );
}
