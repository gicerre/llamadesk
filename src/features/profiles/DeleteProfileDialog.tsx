import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2 } from 'lucide-react';
import { Button, Modal, Spinner } from '@/components/ui';
import { ipc, isTauri } from '@/lib/ipc';
import type { Profile, ProfileDeleteImpact } from '@/types/domain';

interface DeleteProfileDialogProps {
  profile: Profile | null;
  /** Il profilo in cui si ricade se si elimina quello attivo; `null` altrimenti. */
  fallback: Profile | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Il contenuto monta solo a dialogo aperto: niente stato da azzerare. */
function DeleteProfileContent({
  profile,
  fallback,
  onConfirm,
  onCancel,
}: DeleteProfileDialogProps & { profile: Profile }) {
  const { t } = useTranslation();
  const [impact, setImpact] = useState<ProfileDeleteImpact | null>(null);

  useEffect(() => {
    if (!isTauri()) return;

    let cancelled = false;
    void ipc
      .profileDeleteImpact(profile.id)
      .then((result) => {
        if (!cancelled) setImpact(result);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [profile]);

  const rows = impact
    ? ([
        ['impact.containers', impact.containers],
        ['impact.applications', impact.applications],
        ['impact.links', impact.links],
        ['impact.bundles', impact.bundles],
      ] as const)
    : [];

  const isEmpty =
    !!impact && impact.containers + impact.applications + impact.links + impact.bundles === 0;

  return (
    <Modal open onClose={onCancel} tone="danger" labelledBy="delete-profile-title">
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/15 text-red-500">
            <Trash2 strokeWidth={1.75} className="size-5" />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2
              id="delete-profile-title"
              className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              {t('profiles.deleteTitle', { name: profile.name })}
            </h2>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {isEmpty ? t('profiles.deleteEmpty') : t('profiles.deleteCascade')}
            </p>
            {fallback && (
              <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                {t('profiles.deleteActive', { next: fallback.name })}
              </p>
            )}
          </div>
        </div>

        {!impact ? (
          <div className="flex justify-center py-4">
            <Spinner size={20} className="text-zinc-400" />
          </div>
        ) : (
          !isEmpty && (
            <dl className="grid grid-cols-4 gap-2">
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
            {t('profiles.delete')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Conferma di eliminazione di un profilo, con le conseguenze in chiaro.
 *
 * Un profilo è un'istanza intera dell'applicazione: eliminarlo porta via
 * tutto l'albero, i workspace e le impostazioni di aspetto. I numeri li conta
 * Rust (`profile_delete_impact`), come per i contenitori. L'ultimo profilo non
 * arriva mai qui: lo switcher non offre l'azione, e il backend la rifiuta.
 */
export function DeleteProfileDialog(props: DeleteProfileDialogProps) {
  if (!props.profile) return null;
  return <DeleteProfileContent {...props} profile={props.profile} />;
}
