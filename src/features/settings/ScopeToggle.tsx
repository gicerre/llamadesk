import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Globe, UserRound } from 'lucide-react';
import { cn } from '@/lib/cn';
import { springSnappy } from '@/lib/motion';
import { useSessionStore } from '@/stores/sessionStore';
import type { AppSettings } from '@/types/domain';

interface ScopeToggleProps {
  settingKey: keyof AppSettings;
}

/**
 * Ambito di una singola impostazione: globale o solo del profilo attivo.
 *
 * Passare a "solo questo profilo" fotografa il valore corrente come override;
 * tornare a "tutti i profili" lo rimuove, e il profilo riprende a seguire il
 * valore globale — che nel frattempo può essere cambiato.
 */
export function ScopeToggle({ settingKey }: ScopeToggleProps) {
  const { t } = useTranslation();
  const scopedKeys = useSessionStore((state) => state.scopedKeys);
  const overrides = useSessionStore((state) => state.profileOverrides);
  const settings = useSessionStore((state) => state.settings);
  const updateSetting = useSessionStore((state) => state.updateSetting);
  const clearOverride = useSessionStore((state) => state.clearOverride);

  // L'elenco autorevole è quello di Rust: se una chiave non è personalizzabile
  // il controllo non compare affatto.
  if (!scopedKeys.includes(settingKey) || !settings) return null;

  const isOverridden = overrides.includes(settingKey);

  const options = [
    { value: false, icon: Globe, label: t('profiles.scopeGlobal') },
    { value: true, icon: UserRound, label: t('profiles.scopeProfile') },
  ];

  return (
    <div className="flex gap-0.5 rounded-full bg-black/[0.04] p-0.5 dark:bg-white/[0.05]">
      {options.map(({ value, icon: Icon, label }) => {
        const isActive = value === isOverridden;
        return (
          <button
            key={label}
            type="button"
            title={label}
            onClick={() => {
              if (value === isOverridden) return;
              if (value) void updateSetting(settingKey, settings[settingKey], 'profile');
              else void clearOverride(settingKey);
            }}
            className={cn(
              'relative rounded-full p-1.5 transition-colors',
              isActive ? 'text-zinc-900 dark:text-zinc-50' : 'text-zinc-400 hover:text-zinc-600',
            )}
          >
            {isActive && (
              <motion.span
                layoutId={`scope-${settingKey}`}
                transition={springSnappy}
                className="absolute inset-0 -z-10 rounded-full bg-white/80 shadow-sm dark:bg-white/[0.14]"
              />
            )}
            <Icon strokeWidth={1.75} className="size-3" />
          </button>
        );
      })}
    </div>
  );
}
