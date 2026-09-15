import { cn } from '@/lib/cn';

interface KbdProps {
  children: React.ReactNode;
  tone?: 'default' | 'inverse';
  className?: string;
}

/** Una scorciatoia da tastiera, scritta come la scrive Windows: "Ctrl+K". */
export function Kbd({ children, tone = 'default', className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'text-2xs inline-flex h-[18px] items-center rounded-xs px-1.5 font-sans font-medium',
        tone === 'default'
          ? 'bg-hover text-ink-3 shadow-[inset_0_-1px_0_var(--ld-line)]'
          : 'bg-canvas/15 text-canvas/80',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
