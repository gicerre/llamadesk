import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { pageVariants } from '@/lib/motion';
import { CommandPalette } from '@/features/command-palette/CommandPalette';
import { QuickCaptureDialog } from '@/features/quick-capture/QuickCaptureDialog';

/** Shell dell'applicazione: barra titolo, sidebar in vetro, canvas spazioso. */
export function RootLayout() {
  const location = useLocation();

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto px-8 pt-2 pb-10 lg:px-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="mx-auto w-full max-w-6xl"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Dentro il router: la palette naviga verso i contenitori trovati. */}
      <CommandPalette />
      <QuickCaptureDialog />
    </div>
  );
}
