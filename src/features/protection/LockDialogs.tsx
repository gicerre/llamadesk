import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/fields';
import { api } from '@/lib/ipc';
import { invalidateEverything, useLockStatus } from '@/lib/queries';
import { useLockDialogs, type PasswordRequest } from '@/stores/lock';
import { useProfileId } from '@/stores/session';
import { toast, toastError } from '@/stores/toasts';
import { UnlockForm } from './UnlockForm';

/** I dialoghi della protezione, una volta sola nella shell. */
export function LockDialogs() {
  const unlock = useLockDialogs((state) => state.unlock);
  const password = useLockDialogs((state) => state.password);
  const remove = useLockDialogs((state) => state.remove);
  return (
    <>
      {unlock && <UnlockDialog />}
      {password && <PasswordDialog request={password} />}
      {remove && <RemoveLockDialog />}
    </>
  );
}

function UnlockDialog() {
  const { t } = useTranslation();
  const close = useLockDialogs((state) => state.close);
  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={t('lock.unlockTitle')}
      description={t('lock.unlockDescription')}
      closeLabel={t('common.close')}
    >
      <div className="pb-5">
        <UnlockForm autoFocus onUnlocked={close} />
      </div>
    </Dialog>
  );
}

/** Imposta la prima password, o la cambia (serve quella attuale). */
function PasswordDialog({ request }: { request: PasswordRequest }) {
  const { t } = useTranslation();
  const profileId = useProfileId();
  const close = useLockDialogs((state) => state.close);
  const status = useLockStatus();
  const changing = status.data?.hasLock ?? false;

  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 4) {
      setError(t('lock.tooShort'));
      return;
    }
    if (password !== repeat) {
      setError(t('lock.mismatch'));
      return;
    }
    setBusy(true);
    try {
      await api.setLockPassword(profileId, changing ? current : null, password);
      if (request.protectNodeId) {
        await api.updateNode(request.protectNodeId, { isProtected: true });
      }
      close();
      toast({
        title: request.protectNodeId
          ? t('lock.protectedNow')
          : changing
            ? t('lock.passwordChanged')
            : t('lock.passwordSet'),
      });
      await invalidateEverything();
    } catch (failure) {
      setBusy(false);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={changing ? t('lock.changeTitle') : t('lock.setTitle')}
      description={changing ? undefined : t('lock.setDescription')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" form="lock-password" disabled={busy}>
            {request.protectNodeId ? t('lock.setAndProtect') : t('lock.save')}
          </Button>
        </>
      }
    >
      <form
        id="lock-password"
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-3"
      >
        {changing && (
          <TextField
            label={t('lock.current')}
            type="password"
            autoComplete="current-password"
            autoFocus
            value={current}
            onChange={(event) => {
              setCurrent(event.target.value);
              setError(null);
            }}
          />
        )}
        <TextField
          label={t('lock.new')}
          type="password"
          autoComplete="new-password"
          autoFocus={!changing}
          value={password}
          hint={t('lock.hint')}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
        />
        <TextField
          label={t('lock.repeat')}
          type="password"
          autoComplete="new-password"
          value={repeat}
          error={error}
          onChange={(event) => {
            setRepeat(event.target.value);
            setError(null);
          }}
        />
      </form>
    </Dialog>
  );
}

/** Password dimenticata o da togliere: la protezione se ne va con lei. */
function RemoveLockDialog() {
  const { t } = useTranslation();
  const profileId = useProfileId();
  const close = useLockDialogs((state) => state.close);
  const status = useLockStatus();
  const [busy, setBusy] = useState(false);
  const count = status.data?.protectedCount ?? 0;

  const confirm = async () => {
    setBusy(true);
    try {
      const cleared = await api.removeLock(profileId);
      close();
      toast({ title: t('lock.removed', { count: cleared }) });
      await invalidateEverything();
    } catch (failure) {
      setBusy(false);
      toastError(t('lock.removeFailed'), failure);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={t('lock.removeTitle')}
      description={t('lock.removeDescription', { count })}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={() => void confirm()} disabled={busy}>
            {t('lock.removeConfirm')}
          </Button>
        </>
      }
    >
      <p className="bg-hover text-ink-2 flex items-start gap-2 rounded-md px-3 py-2 text-sm">
        <Lock className="text-ink-3 mt-0.5 size-4 shrink-0" aria-hidden />
        {t('lock.removeNote')}
      </p>
    </Dialog>
  );
}
