import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Button, Modal, Spinner } from '@/components/ui';
import { ipc, isTauri } from '@/lib/ipc';
import type { Container, DeleteImpact } from '@/types/domain';

interface DeleteContainerDialogProps {
  container: Container | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Il contenuto monta solo a dialogo aperto: niente stato da azzerare. */
function DeleteContainerContent({
  container,
  onConfirm,
  onCancel,
}: DeleteContainerDialogProps & { container: Container }) {
  const { t } = useTranslation();
  const [impact, setImpact] = useState<DeleteImpact | null>(null);

  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    void ipc
      .containerDeleteImpact(container.id)
      .then((result) => {
        if (!cancelled) setImpact(result);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [container]);

  const rows = impact
    ? ([
        ['impact.containers', impact.containers],
        ['impact.applications', impact.applications],
        ['impact.links', impact.links],
      ] as const)
    : [];

  const isEmpty = !!impact && impact.containers + impact.applications + impact.links === 0;

  return (
    <Modal open onClose={onCancel} tone="danger" labelledBy="delete-container-title">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-500">
            <Trash2 strokeWidth={1.75} className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2
              id="delete-container-title"
              className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              {t('navigator.deleteTitle', { name: container.name })}
            </h2>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {isEmpty ? t('navigator.deleteEmpty') : t('navigator.deleteCascade')}
            </p>
          </div>
        </div>

        {!impact ? (
          <div className="flex justify-center py-4">
            <Spinner size={20} className="text-zinc-400" />
          </div>
        ) : (
          !isEmpty && (
            <dl className="grid grid-cols-3 gap-2">
              {rows.map(([labelKey, count]) => (
                <div
                  key={labelKey}
                  className="flex flex-col rounded-xl bg-red-500/10 px-3 py-2 text-center"
                >
                  <dd className="text-xl font-semibold text-red-600 dark:text-red-400">{count}</dd>
                  <dt className="text-[0.625rem] text-zinc-500">{t(labelKey, { count })}</dt>
                </div>
              ))}
            </dl>
          )
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={!impact}>
            {t('common.delete')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Conferma di cancellazione con le conseguenze in chiaro.
 *
 * La cancellazione è a cascata: eliminare un progetto porta via ambienti,
 * contesti, applicazioni e link. Il numero lo conta Rust
 * (`container_delete_impact`), perché è l'unico che conosce davvero l'albero —
 * e mostrarlo è la differenza fra una conferma vera e un "sei sicuro?" inutile.
 */
export function DeleteContainerDialog(props: DeleteContainerDialogProps) {
  if (!props.container) return null;
  return <DeleteContainerContent {...props} container={props.container} />;
}
