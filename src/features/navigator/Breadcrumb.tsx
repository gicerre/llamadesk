import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Repeat } from 'lucide-react';
import { GlassPanel } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fadeFast, springBouncy } from '@/lib/motion';
import { ipc } from '@/lib/ipc';
import { DangerBadge } from '@/features/danger-zone/DangerBadge';
import type { Container, Crumb, ResolvedDanger } from '@/types/domain';

interface BreadcrumbProps {
  crumbs: Crumb[];
  danger: ResolvedDanger;
  currentId: string;
  siblingEnvironments: Container[];
}

/**
 * Percorso sempre visibile: PROGETTI / ACME / 🔴 PRODUZIONE / Cliente A.
 *
 * Quando il ramo è protetto l'intera barra cambia clima (bordo e alone rossi):
 * l'ambiente in cui si sta operando deve essere leggibile con la coda
 * dell'occhio, senza doverlo cercare.
 */
export function Breadcrumb({ crumbs, danger, currentId, siblingEnvironments }: BreadcrumbProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const isHot = danger.level === 'danger' || danger.level === 'critical';

  /** Environment Switcher: stesso punto, altro ambiente. */
  const jumpTo = async (environmentId: string) => {
    setSwitcherOpen(false);
    try {
      const target = await ipc.resolveSiblingPath(currentId, environmentId);
      navigate(`/c/${target}`);
    } catch {
      navigate(`/c/${environmentId}`);
    }
  };

  return (
    <GlassPanel
      radius="2xl"
      material="subtle"
      className={cn(
        'sticky top-0 z-20 flex flex-wrap items-center gap-1.5 px-3 py-2',
        isHot && 'border-red-500/30 shadow-[0_0_24px_-8px_rgb(239_68_68/0.35)]',
      )}
    >
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;
        return (
          <div key={crumb.id} className="flex items-center gap-1.5">
            {index > 0 && (
              <ChevronRight strokeWidth={1.75} className="size-3.5 shrink-0 text-zinc-400" />
            )}
            <button
              type="button"
              onClick={() => navigate(`/c/${crumb.id}`)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm transition-colors',
                isLast
                  ? 'font-semibold text-zinc-900 dark:text-zinc-50'
                  : 'text-zinc-500 hover:bg-black/[0.05] hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100',
              )}
            >
              {crumb.icon && <span>{crumb.icon}</span>}
              {crumb.name}
            </button>

            {crumb.badgeText && crumb.kind === 'environment' && (
              <DangerBadge level={danger.level} compact />
            )}
          </div>
        );
      })}

      {/* Salto rapido allo stesso punto in un altro ambiente. */}
      {siblingEnvironments.length > 0 && (
        <div className="relative ml-auto">
          <button
            type="button"
            onClick={() => setSwitcherOpen((open) => !open)}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
              'bg-black/[0.05] text-zinc-600 hover:bg-black/[0.1]',
              'dark:bg-white/[0.07] dark:text-zinc-300 dark:hover:bg-white/[0.14]',
              'transition-colors duration-200',
            )}
          >
            <Repeat strokeWidth={1.75} className="size-3" />
            {t('navigator.switchEnvironment')}
          </button>

          <AnimatePresence>
            {switcherOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: springBouncy }}
                exit={{ opacity: 0, y: -4, scale: 0.98, transition: fadeFast }}
                className="glass-panel-strong absolute right-0 z-30 mt-2 flex w-56 flex-col gap-0.5 rounded-2xl p-1.5"
              >
                {siblingEnvironments.map((environment) => (
                  <button
                    key={environment.id}
                    type="button"
                    onClick={() => void jumpTo(environment.id)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.07]"
                  >
                    {environment.icon && <span>{environment.icon}</span>}
                    <span className="flex-1 truncate">{environment.name}</span>
                    <DangerBadge level={environment.dangerLevel ?? 'normal'} compact />
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </GlassPanel>
  );
}
