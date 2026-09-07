import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { Button, Input, Modal } from '@/components/ui';
import { DangerBadge } from './DangerBadge';
import type { BulkOpenPlan } from '@/types/domain';

interface BulkDangerModalProps {
  plan: BulkOpenPlan | null;
  /** Riceve gli id dei link effettivamente da aprire. */
  onConfirm: (linkIds: string[]) => void;
  onCancel: () => void;
}

/**
 * "Apri tutto" su un workspace che contiene link protetti.
 *
 * Una sola conferma per l'intero gruppo, con la possibilità di deselezionare i
 * singoli elementi: se fra i protetti c'è un `critical`, la parola va digitata
 * una volta sola, non una per link.
 */
export function BulkDangerModal({ plan, onConfirm, onCancel }: BulkDangerModalProps) {
  const { t } = useTranslation();
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState('');

  const selectedProtected = useMemo(
    () => (plan?.protected ?? []).filter((intent) => !excluded.has(intent.linkId)),
    [plan, excluded],
  );

  if (!plan) return null;

  const requiredWord =
    plan.highestLevel === 'critical' && selectedProtected.some((i) => i.danger.level === 'critical')
      ? (plan.confirmWord ?? t('danger.confirmWord'))
      : null;

  const canConfirm = !requiredWord || typed.trim() === requiredWord;

  const reset = () => {
    setExcluded(new Set());
    setTyped('');
  };

  const toggle = (linkId: string) => {
    setExcluded((current) => {
      const next = new Set(current);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  };

  const close = () => {
    reset();
    onCancel();
  };

  const confirmAll = () => {
    if (!canConfirm) return;
    const ids = [...plan.safeLinkIds, ...selectedProtected.map((intent) => intent.linkId)];
    reset();
    onConfirm(ids);
  };

  const confirmSafeOnly = () => {
    reset();
    onConfirm(plan.safeLinkIds);
  };

  return (
    <Modal open onClose={close} tone="danger" dismissible={!requiredWord} labelledBy="bulk-title">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-500">
            <ShieldAlert strokeWidth={1.75} className="size-5" />
          </span>
          <div className="flex flex-col gap-1.5">
            <h2
              id="bulk-title"
              className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              {t('danger.bulk.title')}
            </h2>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {t('danger.bulk.message', { count: plan.protected.length, total: plan.total })}
            </p>
          </div>
        </div>

        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
          {plan.protected.map((intent) => (
            <li key={intent.linkId}>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.05]">
                <input
                  type="checkbox"
                  checked={!excluded.has(intent.linkId)}
                  onChange={() => toggle(intent.linkId)}
                  className="size-4 accent-red-500"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                    {intent.applicationName} · {intent.linkName}
                  </span>
                  <span className="truncate font-mono text-[0.6875rem] text-zinc-500">
                    {intent.url}
                  </span>
                </span>
                <DangerBadge level={intent.danger.level} compact />
              </label>
            </li>
          ))}
        </ul>

        {requiredWord && (
          <Input
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            label={t('danger.typeToConfirm', { word: requiredWord })}
            placeholder={requiredWord}
            className="font-mono tracking-wider uppercase"
          />
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          {plan.safeLinkIds.length > 0 && (
            <Button variant="primary" onClick={confirmSafeOnly}>
              {t('danger.bulk.skip', { count: plan.safeLinkIds.length })}
            </Button>
          )}
          <Button variant="danger" onClick={confirmAll} disabled={!canConfirm}>
            {t('danger.bulk.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
