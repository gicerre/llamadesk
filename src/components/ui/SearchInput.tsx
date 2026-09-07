import { forwardRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { springSnappy } from '@/lib/motion';

export interface SearchInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
> {
  value: string;
  onValueChange: (value: string) => void;
  /** `lg` è la variante Spotlight usata dalla Command Palette. */
  scale?: 'md' | 'lg';
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { value, onValueChange, className, scale = 'md', ...props },
  ref,
) {
  const isLarge = scale === 'lg';

  return (
    <div className="no-drag relative flex w-full items-center">
      <Search
        strokeWidth={1.75}
        className={cn(
          'pointer-events-none absolute text-zinc-400 dark:text-zinc-500',
          isLarge ? 'left-5 size-5' : 'left-3 size-4',
        )}
      />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(
          'w-full bg-transparent text-zinc-900 placeholder:text-zinc-400',
          'dark:text-zinc-50 dark:placeholder:text-zinc-500',
          'transition-all duration-300 ease-[var(--ease-glass)]',
          isLarge
            ? 'h-16 pr-14 pl-14 text-lg font-medium tracking-tight'
            : cn(
                'h-9 rounded-xl border border-transparent pr-9 pl-9 text-sm backdrop-blur-md',
                'bg-black/[0.04] focus:bg-black/[0.07] focus:ring-2 focus:ring-black/10',
                'dark:bg-white/[0.05] dark:focus:bg-white/10 dark:focus:ring-white/20',
              ),
          className,
        )}
        {...props}
      />
      <AnimatePresence>
        {value.length > 0 && (
          <motion.button
            type="button"
            onClick={() => onValueChange('')}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            whileTap={{ scale: 0.9 }}
            transition={springSnappy}
            className={cn(
              'absolute flex items-center justify-center rounded-full',
              'bg-black/10 text-zinc-600 hover:bg-black/20',
              'dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/20',
              isLarge ? 'right-5 size-7' : 'right-2 size-5',
            )}
          >
            <X strokeWidth={2} className={isLarge ? 'size-4' : 'size-3'} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
});
