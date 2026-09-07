import { motion } from 'framer-motion';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { springSnappy } from '@/lib/motion';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium leading-tight backdrop-blur-md border',
  {
    variants: {
      tone: {
        neutral:
          'bg-black/[0.06] text-zinc-600 border-black/5 dark:bg-white/10 dark:text-zinc-300 dark:border-white/10',
        prod: 'bg-red-500/15 text-red-600 border-red-500/25 dark:text-red-400 dark:bg-red-500/20',
        test: 'bg-orange-500/15 text-orange-600 border-orange-500/25 dark:text-orange-400 dark:bg-orange-500/20',
        dev: 'bg-cyan-500/15 text-cyan-700 border-cyan-500/25 dark:text-cyan-300 dark:bg-cyan-500/20',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends
    Omit<
      React.HTMLAttributes<HTMLSpanElement>,
      'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'
    >,
    VariantProps<typeof badgeVariants> {
  /** Mostra un pallino pulsante a sinistra (usato per la produzione). */
  pulse?: boolean;
  interactive?: boolean;
}

export function Badge({ className, tone, pulse, interactive, children, ...props }: BadgeProps) {
  return (
    <motion.span
      className={cn(badgeVariants({ tone }), interactive && 'no-drag cursor-pointer', className)}
      whileTap={interactive ? { scale: 0.95 } : undefined}
      transition={springSnappy}
      {...props}
    >
      {pulse && <span className="pulse-danger size-1.5 rounded-full bg-current" />}
      {children}
    </motion.span>
  );
}
