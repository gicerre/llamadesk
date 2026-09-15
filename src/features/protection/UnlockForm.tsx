import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/fields';
import { cn } from '@/lib/cn';
import { api } from '@/lib/ipc';
import { invalidateEverything, useLockStatus } from '@/lib/queries';
import { useLockDialogs } from '@/stores/lock';
import { useProfileId } from '@/stores/session';
import { toast } from '@/stores/toasts';

/**
 * Sblocco con la password del profilo. Dopo tre errori Rust impone
 * un'attesa crescente: qui si mostra il conto alla rovescia.
 */
export function UnlockForm({
  onUnlocked,
  autoFocus = false,
  className,
}: {
  onUnlocked?: () => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const profileId = useProfileId();
  const status = useLockStatus();
  const openPassword = useLockDialogs((state) => state.openPassword);
  const openRemove = useLockDialogs((state) => state.openRemove);

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (retryAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  const waiting = retryAt !== null && retryAt > now ? Math.ceil((retryAt - now) / 1000) : 0;

  if (status.data && !status.data.hasLock) {
    return (
      <div className={cn('flex flex-col items-center gap-3 text-center', className)}>
        <p className="text-ink-2 max-w-[46ch] text-sm">{t('lock.noPassword')}</p>
        <Button variant="primary" onClick={() => openPassword()}>
          {t('lock.setPassword')}
        </Button>
      </div>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || waiting > 0) return;
    setBusy(true);
    try {
      const outcome = await api.unlock(profileId, password);
      if (outcome.unlocked) {
        setPassword('');
        toast({ title: t('lock.unlocked') });
        onUnlocked?.();
        await invalidateEverything();
        return;
      }
      setPassword('');
      const clock = Date.now();
      setNow(clock);
      setRetryAt(outcome.retryAfterSeconds > 0 ? clock + outcome.retryAfterSeconds * 1000 : null);
      setError(t('lock.wrong'));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className={cn('flex w-full max-w-sm flex-col gap-2', className)}
    >
      <label htmlFor={id} className="sr-only">
        {t('lock.password')}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="password"
          value={password}
          autoFocus={autoFocus}
          autoComplete="current-password"
          placeholder={t('lock.password')}
          aria-invalid={error ? true : undefined}
          disabled={waiting > 0}
          onChange={(event) => {
            setPassword(event.target.value);
            setError(null);
          }}
          className={inputClass}
        />
        <Button type="submit" variant="primary" disabled={busy || !password || waiting > 0}>
          {t('lock.unlock')}
        </Button>
      </div>
      <div className="flex min-h-5 items-center justify-between gap-3 text-xs">
        <span className={cn(waiting > 0 || error ? 'text-danger' : 'text-ink-3')} role="status">
          {waiting > 0 ? t('lock.wait', { count: waiting }) : error}
        </span>
        <button
          type="button"
          onClick={() => openRemove()}
          className="text-ink-3 hover:text-ink shrink-0 hover:underline"
        >
          {t('lock.forgot')}
        </button>
      </div>
    </form>
  );
}
