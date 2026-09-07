import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, Search, Settings, Zap } from 'lucide-react';
import { cn } from '@/lib/cn';
import { LAYOUT_IDS, springSnappy } from '@/lib/motion';
import { useUiStore } from '@/stores/uiStore';
import { useActiveProfile, useSessionStore } from '@/stores/sessionStore';
import { useDataStore } from '@/stores/dataStore';
import { NavigatorTree } from '@/features/navigator/NavigatorTree';

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const openPalette = useUiStore((state) => state.openPalette);
  const profile = useActiveProfile();
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
      {/* Profilo attivo */}
      <button
        type="button"
        className={cn(
          'no-drag flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left',
          'transition-colors duration-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
        )}
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400/80 to-cyan-400/80 text-base">
          {profile?.icon ?? '\u{1F999}'}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
            {profile?.name ?? '—'}
          </span>
          <span className="text-[0.6875rem] text-zinc-500 dark:text-zinc-500">
            {t('nav.profile')}
          </span>
        </span>
      </button>

      {/* Scorciatoia alla ricerca globale */}
      <button
        type="button"
        onClick={openPalette}
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
        <NavigatorTree rootKind="project" label={t('nav.projects')} />
        <NavigatorTree rootKind="workspace" label={t('nav.workspaces')} />
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
