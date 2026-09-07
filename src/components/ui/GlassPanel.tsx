import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const glassVariants = cva('glass-hairline', {
  variants: {
    material: {
      subtle: 'glass-panel-subtle',
      regular: 'glass-panel',
      strong: 'glass-panel-strong',
    },
    radius: {
      xl: 'rounded-xl',
      '2xl': 'rounded-2xl',
      '3xl': 'rounded-3xl',
      '4xl': 'rounded-4xl',
      full: 'rounded-full',
    },
  },
  defaultVariants: { material: 'regular', radius: '2xl' },
});

export interface GlassPanelProps
  extends Omit<HTMLMotionProps<'div'>, 'children'>, VariantProps<typeof glassVariants> {
  children?: React.ReactNode;
}

/** Il materiale base dell'interfaccia: uno strato di vetro che campiona lo sfondo. */
export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(function GlassPanel(
  { className, material, radius, children, ...props },
  ref,
) {
  return (
    <motion.div ref={ref} className={cn(glassVariants({ material, radius }), className)} {...props}>
      {children}
    </motion.div>
  );
});
