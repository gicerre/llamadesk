import { ScopeToggle } from './ScopeToggle';
import type { AppSettings } from '@/types/domain';

interface SettingRowProps {
  title: string;
  description?: string;
  /**
   * Se l'impostazione può variare per profilo, indica quale chiave: la riga
   * mostra da sé il selettore globale / solo-questo-profilo.
   */
  scopeKey?: keyof AppSettings;
  children: React.ReactNode;
}

/** Riga di impostazione: etichetta a sinistra, ambito e controllo a destra. */
export function SettingRow({ title, description, scopeKey, children }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{title}</span>
        {description && (
          <span className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
            {description}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {scopeKey && <ScopeToggle settingKey={scopeKey} />}
        {children}
      </div>
    </div>
  );
}
