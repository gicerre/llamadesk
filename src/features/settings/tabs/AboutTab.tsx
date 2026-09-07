import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { GlassPanel } from '@/components/ui';
import { Logo } from '@/components/Logo';
import { useSessionStore } from '@/stores/sessionStore';

export function AboutTab() {
  const { t } = useTranslation();
  const appVersion = useSessionStore((state) => state.appVersion);
  const dbPath = useSessionStore((state) => state.dbPath);

  return (
    <GlassPanel radius="3xl" className="flex flex-col gap-5 p-6">
      <div className="flex items-center gap-3">
        <Logo size={40} />
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">LlamaDesk</span>
          <span className="font-mono text-xs text-zinc-500">{appVersion}</span>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-2xl bg-emerald-500/10 p-4">
        <ShieldCheck strokeWidth={1.5} className="mt-0.5 size-5 shrink-0 text-emerald-500" />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {t('settings.privacyTitle')}
          </span>
          <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {t('settings.privacyBody')}
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
        <dt className="text-zinc-500">{t('settings.dbPath')}</dt>
        <dd className="selectable font-mono break-all text-zinc-600 dark:text-zinc-300">
          {dbPath}
        </dd>
        <dt className="text-zinc-500">{t('settings.license')}</dt>
        <dd className="text-zinc-600 dark:text-zinc-300">MIT</dd>
      </dl>
    </GlassPanel>
  );
}
