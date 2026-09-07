import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { springSnappy } from '@/lib/motion';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
}

/** Interruttore stile iOS: il pallino scivola con una molla, non con un tween. */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  className,
  ...aria
}: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria['aria-label']}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'no-drag relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full p-[3px]',
        'transition-colors duration-300 ease-[var(--ease-glass)]',
        'focus-visible:ring-2 focus-visible:ring-white/30',
        checked
          ? 'bg-emerald-500/90 shadow-[inset_0_1px_2px_rgb(0_0_0/0.2)]'
          : 'bg-black/15 dark:bg-white/15',
        disabled && 'cursor-not-allowed opacity-50',
        className,
      )}
    >
      <motion.span
        layout
        transition={springSnappy}
        className={cn(
          'block size-5 rounded-full bg-white shadow-md',
          checked ? 'ml-auto' : 'mr-auto',
        )}
      />
    </button>
  );
}
