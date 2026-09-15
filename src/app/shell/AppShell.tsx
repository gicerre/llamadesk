import { useTranslation } from 'react-i18next';
import { useLocation, Outlet } from 'react-router-dom';
import { motion } from 'framer-motion';
import { DialogHost } from '@/features/create/DialogHost';
import { InspectorPanel } from '@/features/inspector/InspectorPanel';
import { CommandPalette } from '@/features/palette/CommandPalette';
import { LockBridge } from '@/features/protection/LockBridge';
import { LockDialogs } from '@/features/protection/LockDialogs';
import { FileDropBridge } from '@/features/resources/FileDropBridge';
import { pageVariants } from '@/lib/motion';
import { Sidebar } from '../sidebar/Sidebar';
import { TitleBar } from './TitleBar';

/**
 * La finestra: barra del titolo e sidebar sul materiale di sistema, il
 * contenuto su una superficie solida con l'angolo in alto a sinistra
 * arrotondato, come un foglio appoggiato sul materiale.
 */
export function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <div className="bg-chrome flex h-full flex-col">
      <a
        href="#contenuto"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('contenuto')?.focus();
        }}
        className="bg-accent text-on-accent sr-only z-[90] rounded-sm px-3 py-1.5 text-sm font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('shell.skipToContent')}
      </a>
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main
          id="contenuto"
          tabIndex={-1}
          className="bg-canvas relative flex min-w-0 flex-1 overflow-hidden rounded-tl-lg shadow-[inset_1px_1px_0_var(--ld-chrome-line)]"
        >
          <motion.div
            key={location.pathname}
            variants={pageVariants}
            initial="hidden"
            animate="visible"
            className="h-full min-w-0 flex-1 overflow-y-auto"
          >
            <Outlet />
          </motion.div>
          {/* Il pannello di dettaglio affianca la pagina, non la copre. */}
          <InspectorPanel />
        </main>
      </div>
      <DialogHost />
      <CommandPalette />
      <LockDialogs />
      <LockBridge />
      <FileDropBridge />
    </div>
  );
}
