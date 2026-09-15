import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/fields';
import { toastError } from '@/stores/toasts';
import { confirmAction, useActionConfirm } from './run';

/**
 * "Chiedi conferma prima di aprire". Con il livello "digita il nome" il
 * pulsante si abilita solo quando il nome coincide: la stessa regola che
 * Rust verifica di nuovo.
 */
export function ConfirmActionDialog() {
  const pending = useActionConfirm((state) => state.pending);
  if (!pending) return null;
  return <ConfirmBody key={`${pending.args.nodeId}-${pending.args.actionId}`} />;
}

function ConfirmBody() {
  const { t } = useTranslation();
  const pending = useActionConfirm((state) => state.pending);
  const close = useActionConfirm((state) => state.close);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  if (!pending) return null;
  const { plan } = pending;
  const needsName = plan.caution === 'type_name';
  const matches = typed.trim().toLowerCase() === plan.nodeName.trim().toLowerCase();

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (needsName && !matches) return;
    setBusy(true);
    try {
      await confirmAction(pending, needsName ? typed : 'confirmed');
      close();
    } catch (error) {
      setBusy(false);
      toastError(t('actions.failed', { name: plan.nodeName }), error);
    }
  };

  const what =
    plan.count > 1
      ? t('actions.confirm.many', { count: plan.count })
      : t('actions.confirm.one', { name: plan.nodeName });
  const how = plan.tool
    ? plan.browserProfile
      ? t('actions.done.inProfile', { tool: plan.tool.name, profile: plan.browserProfile })
      : t('actions.done.in', { tool: plan.tool.name })
    : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={t('actions.confirm.title', { name: plan.nodeName })}
      description={how ? `${what} ${how}.` : what}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            type="submit"
            form="confirm-action"
            autoFocus={!needsName}
            disabled={busy || (needsName && !matches)}
          >
            {t('actions.confirm.submit')}
          </Button>
        </>
      }
    >
      <form
        id="confirm-action"
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-3"
      >
        <p className="bg-danger-soft text-danger flex items-start gap-2 rounded-md px-3 py-2 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t('actions.confirm.reason')}
        </p>
        {needsName && (
          <TextField
            label={t('actions.confirm.typeName', { name: plan.nodeName })}
            value={typed}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setTyped(event.target.value)}
          />
        )}
      </form>
    </Dialog>
  );
}
