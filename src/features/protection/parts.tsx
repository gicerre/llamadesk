import { useTranslation } from 'react-i18next';
import { Lock, LockOpen } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { useLockStatus } from '@/lib/queries';
import { useLockDialogs } from '@/stores/lock';
import type { NodeView } from '@/types/generated/NodeView';
import { lockNow } from './lock';
import { UnlockForm } from './UnlockForm';

/**
 * Al posto del contenuto di un contenitore protetto, a sessione bloccata: il
 * nome resta (lo dice l'intestazione), il resto dell'app resta usabile.
 */
export function LockedPanel({ view, className }: { view: NodeView; className?: string }) {
  const { t } = useTranslation();
  const source = view.protection.isOwn ? null : view.protection.inheritedFrom;
  return (
    <section
      aria-label={t('lock.lockedTitle', { name: view.node.name })}
      className={cn(
        'bg-surface shadow-1 mt-8 flex flex-col items-center gap-4 rounded-xl px-6 py-12 text-center',
        className,
      )}
    >
      <span className="bg-hover text-ink-2 flex size-12 items-center justify-center rounded-full">
        <Lock className="size-5" aria-hidden />
      </span>
      <div>
        <h2 className="font-display text-ink text-lg font-semibold text-balance">
          {t('lock.lockedTitle', { name: view.node.name })}
        </h2>
        <p className="text-ink-2 mt-1 text-sm text-balance">
          {source
            ? t('lock.lockedByDescription', { name: source.name })
            : t('lock.lockedDescription')}
        </p>
      </div>
      <UnlockForm autoFocus />
    </section>
  );
}

/** "N elementi protetti · Sblocca": dove il blocco toglie qualcosa da un elenco. */
export function ProtectedNotice({ className }: { className?: string }) {
  const { t } = useTranslation();
  const status = useLockStatus();
  const openUnlock = useLockDialogs((state) => state.openUnlock);
  if (!status.data || status.data.unlocked || status.data.protectedCount === 0) return null;
  return (
    <p className={cn('text-ink-3 flex items-center gap-2 text-xs', className)}>
      <Lock className="size-3.5" aria-hidden />
      {t('lock.hiddenCount', { count: status.data.protectedCount })}
      <span aria-hidden>·</span>
      <button
        type="button"
        onClick={() => openUnlock()}
        className="text-accent font-semibold hover:underline"
      >
        {t('lock.unlock')}
      </button>
    </p>
  );
}

/** Lucchetto nella barra del titolo: blocca subito, o apre lo sblocco. */
export function LockButton() {
  const { t } = useTranslation();
  const status = useLockStatus();
  const openUnlock = useLockDialogs((state) => state.openUnlock);
  if (!status.data?.hasLock) return null;
  const { unlocked } = status.data;
  const label = unlocked ? t('lock.lockNow') : t('lock.unlockTitle');
  return (
    <Tip label={label} shortcut="Ctrl+L">
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        aria-label={label}
        onClick={() => (unlocked ? void lockNow() : openUnlock())}
        className="mr-1"
      >
        {unlocked ? <LockOpen /> : <Lock />}
      </Button>
    </Tip>
  );
}
