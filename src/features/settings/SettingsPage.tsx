import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { LAYOUT_IDS, pageVariants, springSnappy, staggerItem } from '@/lib/motion';
import { GeneralTab } from './tabs/GeneralTab';
import { AppearanceTab } from './tabs/AppearanceTab';
import { ShortcutsTab } from './tabs/ShortcutsTab';
import { DangerTab } from './tabs/DangerTab';
import { DataTab } from './tabs/DataTab';
import { AboutTab } from './tabs/AboutTab';

const TABS = ['general', 'appearance', 'shortcuts', 'danger', 'data', 'about'] as const;
type Tab = (typeof TABS)[number];

const PANELS: Record<Tab, () => React.ReactElement> = {
  general: GeneralTab,
  appearance: AppearanceTab,
  shortcuts: ShortcutsTab,
  danger: DangerTab,
  data: DataTab,
  about: AboutTab,
};

/** Guscio delle impostazioni: solo navigazione, il contenuto vive nei tab. */
export function SettingsPage() {
  const { t } = useTranslation();
  const [active, setActive] = useState<Tab>('general');
  const Panel = PANELS[active];

  return (
    <div className="flex flex-col gap-5 py-6">
      <motion.h1
        variants={staggerItem}
        initial="hidden"
        animate="visible"
        className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
      >
        {t('settings.title')}
      </motion.h1>

      <nav className="flex flex-wrap gap-1 rounded-full bg-black/[0.04] p-1 dark:bg-white/[0.05]">
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActive(tab)}
            className={cn(
              'relative rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
              active === tab
                ? 'text-zinc-900 dark:text-zinc-50'
                : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100',
            )}
          >
            {active === tab && (
              <motion.span
                layoutId={LAYOUT_IDS.tabIndicator}
                transition={springSnappy}
                className="absolute inset-0 -z-10 rounded-full bg-white/80 shadow-sm dark:bg-white/[0.14]"
              />
            )}
            {t(`settings.tabs.${tab}`)}
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          variants={pageVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <Panel />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
