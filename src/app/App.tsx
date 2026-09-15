import { MotionConfig } from 'framer-motion';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/Tooltip';
import { queryClient } from '@/lib/queries';
import { BootstrapGate } from './BootstrapGate';
import { router } from './router';

export function App() {
  return (
    <MotionConfig reducedMotion="user">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <BootstrapGate>
            <RouterProvider router={router} />
          </BootstrapGate>
        </TooltipProvider>
      </QueryClientProvider>
    </MotionConfig>
  );
}
