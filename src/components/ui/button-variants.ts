import { cva } from 'class-variance-authority';

/* Superellissi, vetro traslucido, riflesso interno sul bordo superiore.
   Nessun bottone pieno e opaco: il colore serve solo a segnalare l'intento. */
export const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center gap-2 select-none',
    'font-medium whitespace-nowrap no-drag',
    'border-t border-white/20 dark:border-white/[0.14]',
    'transition-colors duration-200 ease-[var(--ease-glass)]',
    'disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed',
    'focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-black/[0.06] text-zinc-900 hover:bg-black/[0.1]',
          'dark:bg-white/10 dark:text-zinc-50 dark:hover:bg-white/[0.16]',
          'backdrop-blur-xl shadow-[0_2px_8px_-2px_rgb(0_0_0/0.25)]',
        ],
        ghost: [
          'border-transparent bg-transparent text-zinc-600 hover:bg-black/[0.06] hover:text-zinc-900',
          'dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-50',
        ],
        danger: [
          'bg-red-500/15 text-red-600 hover:bg-red-500/25 border-red-400/30',
          'dark:text-red-400 dark:bg-red-500/20 dark:hover:bg-red-500/30',
          'backdrop-blur-xl',
        ],
        accent: [
          'bg-white/85 text-zinc-900 hover:bg-white',
          'dark:bg-white/90 dark:text-zinc-900 dark:hover:bg-white',
          'shadow-[0_8px_24px_-8px_rgb(0_0_0/0.45)]',
        ],
      },
      size: {
        sm: 'h-8 px-3 text-xs rounded-xl',
        md: 'h-10 px-4 text-sm rounded-xl',
        lg: 'h-12 px-6 text-[0.95rem] rounded-2xl',
        icon: 'h-9 w-9 rounded-xl',
        pill: 'h-10 px-5 text-sm rounded-full',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);
