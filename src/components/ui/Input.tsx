import { forwardRef, useId } from 'react';
import { cn } from '@/lib/cn';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
  /** Icona resa a sinistra, dentro il campo. */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, label, hint, error, leading, trailing, id, ...props },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="px-1 text-xs font-medium text-zinc-500 dark:text-zinc-400"
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leading && (
          <span className="pointer-events-none absolute left-3 text-zinc-400 dark:text-zinc-500">
            {leading}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'no-drag h-10 w-full rounded-xl px-3.5 text-sm',
            'bg-black/[0.04] text-zinc-900 placeholder:text-zinc-400',
            'dark:bg-white/[0.05] dark:text-zinc-100 dark:placeholder:text-zinc-500',
            'border border-transparent backdrop-blur-md',
            'transition-all duration-300 ease-[var(--ease-glass)]',
            'focus:bg-black/[0.07] focus:ring-2 focus:ring-black/10',
            'dark:focus:bg-white/10 dark:focus:ring-white/20',
            error && 'ring-2 ring-red-500/40',
            leading && 'pl-9',
            trailing && 'pr-9',
            className,
          )}
          aria-invalid={!!error}
          {...props}
        />
        {trailing && <span className="absolute right-2 flex items-center">{trailing}</span>}
      </div>
      {(hint || error) && (
        <p
          className={cn(
            'px-1 text-xs',
            error ? 'text-red-500 dark:text-red-400' : 'text-zinc-500 dark:text-zinc-500',
          )}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
});
