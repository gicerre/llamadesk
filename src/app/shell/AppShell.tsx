import { useLocation, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DialogHost } from '@/features/create/DialogHost';
import { pageVariants } from '@/lib/motion';
import { Sidebar } from '../sidebar/Sidebar';
import { TitleBar } from './TitleBar';

/**
 * La finestra: barra del titolo e sidebar sul materiale di sistema, il
 * contenuto su una superficie solida con l'angolo in alto a sinistra
 * arrotondato, come un foglio appoggiato sul materiale.
 */
export function AppShell() {
  const location = useLocation();

  return (
    <div className="bg-chrome flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="bg-canvas relative min-w-0 flex-1 overflow-hidden rounded-tl-lg shadow-[inset_1px_1px_0_var(--ld-chrome-line)]">
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="hidden"
            animate="visible"
            className="h-full overflow-y-auto"
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <DialogHost />
    </div>
  );
}
