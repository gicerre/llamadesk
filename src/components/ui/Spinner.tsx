import { cn } from '@/lib/cn';

interface SpinnerProps {
  className?: string;
  size?: number;
}

/** Spinner fluido, disegnato in SVG: nessun font-icon, nessuna dipendenza. */
export function Spinner({ className, size = 16 }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin', className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
