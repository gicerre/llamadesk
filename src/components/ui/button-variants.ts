import { cva } from 'class-variance-authority';

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm font-semibold whitespace-nowrap',
    'transition-[background-color,color,box-shadow,opacity] duration-120 ease-out',
    'disabled:pointer-events-none disabled:opacity-40',
    '[&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        /** Uno per area: l'azione che conta. Prende l'accento del workspace. */
        primary: 'bg-accent text-on-accent hover:brightness-110 active:brightness-95',
        secondary: 'bg-surface text-ink shadow-1 hover:bg-raised hover:shadow-2 active:bg-press',
        ghost: 'text-ink-2 hover:bg-hover hover:text-ink active:bg-press',
        danger: 'bg-danger text-white hover:brightness-110 dark:text-sunken',
      },
      size: {
        sm: 'h-[26px] px-2.5 text-xs',
        md: 'h-[30px] px-3 text-sm',
        lg: 'h-9 px-4 text-base',
      },
      iconOnly: {
        true: 'px-0',
      },
    },
    compoundVariants: [
      { size: 'sm', iconOnly: true, className: 'w-[26px]' },
      { size: 'md', iconOnly: true, className: 'w-[30px]' },
      { size: 'lg', iconOnly: true, className: 'w-9' },
    ],
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);
