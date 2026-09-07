import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { CornerDownRight, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/cn';
import { springSnappy } from '@/lib/motion';
import type { DangerLevel } from '@/types/domain';

interface DangerLevelPickerProps {
  /** `null` significa "eredita dal padre". */
  value: DangerLevel | null;
  onChange: (value: DangerLevel | null) => void;
  /** Livello che verrebbe ereditato, mostrato accanto all'opzione "eredita". */
  inheritedLabel?: string;
}

const OPTIONS: { value: DangerLevel | null; icon: typeof ShieldCheck; key: string }[] = [
  { value: null, icon: CornerDownRight, key: 'inherit' },
  { value: 'normal', icon: ShieldCheck, key: 'normal' },
  { value: 'warning', icon: TriangleAlert, key: 'warning' },
  { value: 'danger', icon: TriangleAlert, key: 'danger' },
  { value: 'critical', icon: ShieldAlert, key: 'critical' },
];

const ACTIVE_STYLE: Record<string, string> = {
  inherit: 'bg-white/80 text-zinc-900 dark:bg-white/[0.14] dark:text-zinc-50',
  normal: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-orange-500/20 text-orange-600 dark:text-orange-400',
  danger: 'bg-red-500/20 text-red-600 dark:text-red-400',
  critical: 'bg-red-500/30 text-red-700 dark:text-red-300',
};

/**
 * Selettore del livello di protezione.
 *
 * "Eredita" è un'opzione a sé, non l'assenza di scelta: è ciò che permette a un
 * singolo link di sfilarsi dalla protezione del suo ambiente, o di aggiungerne
 * una dove non ce n'era.
 */
export function DangerLevelPicker({ value, onChange, inheritedLabel }: DangerLevelPickerProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-2">
      <span className="px-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
        {t('danger.protection')}
      </span>

      <div className="flex flex-wrap gap-1 rounded-2xl bg-black/[0.04] p-1 dark:bg-white/[0.05]">
        {OPTIONS.map(({ value: option, icon: Icon, key }) => {
          const isActive = value === option;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(option)}
              className={cn(
                'relative flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium whitespace-nowrap',
                'transition-colors duration-200',
                !isActive &&
                  'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100',
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="dangerLevelPill"
                  transition={springSnappy}
                  className={cn('absolute inset-0 -z-10 rounded-xl', ACTIVE_STYLE[key])}
                />
              )}
              <Icon strokeWidth={1.75} className="size-3.5" />
              {t(`danger.levels.${key}`)}
            </button>
          );
        })}
      </div>

      {value === null && inheritedLabel && (
        <span className="px-1 text-[0.6875rem] text-zinc-500">
          {t('danger.inheritedFrom', { name: inheritedLabel })}
        </span>
      )}
    </div>
  );
}
