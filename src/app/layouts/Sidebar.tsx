import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, Search, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/cn';
import { LAYOUT_IDS, springSnappy } from '@/lib/motion';
import { useUiStore } from '@/stores/uiStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useDataStore } from '@/stores/dataStore';
import { NavigatorDnd } from '@/features/navigator/NavigatorDnd';
import { NavigatorTree } from '@/features/navigator/NavigatorTree';
import { ProfileSwitcher } from '@/features/profiles/ProfileSwitcher';

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const openPalette = useUiStore((state) => state.openPalette);
  const activeProfileId = useSessionStore((state) => state.activeProfileId);

  const loadTree = useDataStore((state) => state.loadTree);
  const loadHealth = useDataStore((state) => state.loadHealth);

  // Cambiare profilo ricarica l'intero albero: i profili sono mondi separati.
  useEffect(() => {
    void loadTree();
    void loadHealth();
  }, [activeProfileId, loadTree, loadHealth]);

  const isDashboard = location.pathname === '/';

  return (
    <aside className="glass-panel glass-hairline m-3 mt-0 flex w-64 shrink-0 flex-col gap-3 rounded-3xl p-3">
      <ProfileSwitcher />

      {/* Scorciatoia alla ricerca globale */}
      <button
        type="button"
        onClick={() => openPalette()}
        className={cn(
          'no-drag flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm',
          'bg-black/[0.04] text-zinc-500 dark:bg-white/[0.05] dark:text-zinc-400',
          'transition-colors duration-200 hover:bg-black/[0.07] dark:hover:bg-white/10',
        )}
      >
        <Search strokeWidth={1.75} className="size-4" />
        <span className="flex-1 text-left">{t('nav.search')}</span>
        <kbd className="rounded-md bg-black/[0.06] px-1.5 py-0.5 font-mono text-[0.625rem] dark:bg-white/10">
          Ctrl+Space
        </kbd>
      </button>

      <NavLink
        to="/"
        className={cn(
          'no-drag relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium',
          'transition-colors duration-200',
          isDashboard
            ? 'text-zinc-900 dark:text-zinc-50'
            : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100',
        )}
      >
        {isDashboard && (
          <motion.span
            layoutId={LAYOUT_IDS.sidebarPill}
            transition={springSnappy}
            className="absolute inset-0 -z-10 rounded-xl bg-black/[0.06] dark:bg-white/10"
          />
        )}
        <LayoutDashboard strokeWidth={1.75} className="size-4" />
        {t('nav.dashboard')}
      </NavLink>

      {/* L'albero vero e proprio */}
      <NavLink
        to="/quick"
        className={({ isActive }) =>
          cn(
            'no-drag flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium',
            'transition-colors duration-200',
            isActive
              ? 'bg-black/[0.06] text-zinc-900 dark:bg-white/10 dark:text-zinc-50'
              : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100',
          )
        }
      >
        <Zap strokeWidth={1.75} className="size-4" />
        {t('nav.quickWorkspaces')}
      </NavLink>

      <div className="-mr-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pr-1">
        <NavigatorDnd>
          <NavigatorTree rootKind="project" label={t('nav.projects')} />
          <NavigatorTree rootKind="workspace" label={t('nav.workspaces')} />
        </NavigatorDnd>
      </div>

      <NavLink
        to="/settings"
        className={({ isActive }) =>
          cn(
            'no-drag flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium',
            'transition-colors duration-200',
            isActive
              ? 'bg-black/[0.06] text-zinc-900 dark:bg-white/10 dark:text-zinc-50'
              : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100',
          )
        }
      >
        <Settings strokeWidth={1.75} className="size-4" />
        {t('nav.settings')}
      </NavLink>
    </aside>
  );
}
