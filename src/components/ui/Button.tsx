import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';
import { springSnappy } from '@/lib/motion';
import { Spinner } from './Spinner';
import { buttonVariants } from './button-variants';

export interface ButtonProps
  extends Omit<HTMLMotionProps<'button'>, 'children'>, VariantProps<typeof buttonVariants> {
  children?: React.ReactNode;
  /** Sostituisce il contenuto con uno spinner e blocca il click. */
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, isLoading = false, disabled, children, ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || isLoading}
      whileHover={disabled || isLoading ? undefined : { scale: 1.02 }}
      whileTap={disabled || isLoading ? undefined : { scale: 0.95 }}
      transition={springSnappy}
      {...props}
    >
      {isLoading ? <Spinner /> : children}
    </motion.button>
  );
});
