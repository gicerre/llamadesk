import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/fields';
import { api } from '@/lib/ipc';
import { invalidateEverything, useLockStatus } from '@/lib/queries';
import { useLockDialogs } from '@/stores/lock';
import { useActiveProfile, useSession } from '@/stores/session';
import { toastError } from '@/stores/toasts';
import { lockNow } from '../protection/lock';
import { Group, Row } from './parts';

const AUTO_MINUTES = [0, 1, 5, 10, 15, 30, 60];

/** Password di blocco del profilo attivo e blocco automatico. */
export function ProtectionSettings() {
  const { t } = useTranslation();
  const profile = useActiveProfile();
  const refreshProfiles = useSession((state) => state.refreshProfiles);
  const status = useLockStatus();
  const dialogs = useLockDialogs();

  if (!profile || !status.data) return null;
  const { hasLock, unlocked, protectedCount, autoMinutes } = status.data;

  const setAuto = async (value: string) => {
    try {
      await api.updateProfile(profile.id, { lockAutoMinutes: Number(value) });
      await Promise.all([refreshProfiles(), invalidateEverything()]);
    } catch (error) {
      toastError(t('settings.saveFailed'), error);
    }
  };

  return (
    <Group title={t('lock.section')}>
      <Row
        label={t('lock.passwordRow', { name: profile.name })}
        hint={hasLock ? t('lock.statusCount', { count: protectedCount }) : t('lock.statusNone')}
        control={(id) => (
          <span id={id} className="flex flex-wrap justify-end gap-2">
            {hasLock && unlocked && (
              <Button onClick={() => void lockNow()}>
                <Lock />
                {t('lock.lockNow')}
              </Button>
            )}
            {hasLock && !unlocked && (
              <Button onClick={() => dialogs.openUnlock()}>{t('lock.unlock')}</Button>
            )}
            <Button variant={hasLock ? 'ghost' : 'primary'} onClick={() => dialogs.openPassword()}>
              {hasLock ? t('lock.changeTitle') : t('lock.setPassword')}
            </Button>
          </span>
        )}
      />
      {hasLock && (
        <>
          <Row
            label={t('lock.auto')}
            hint={t('lock.autoHint')}
            control={(id) => (
              <Select
                id={id}
                className="w-40"
                value={String(autoMinutes)}
                onValueChange={(value) => void setAuto(value)}
                options={AUTO_MINUTES.map((minutes) => ({
                  value: String(minutes),
                  label:
                    minutes === 0 ? t('lock.autoNever') : t('lock.autoMinutes', { count: minutes }),
                }))}
              />
            )}
          />
          <Row
            label={t('lock.removeTitle')}
            hint={t('lock.removeHint')}
            control={(id) => (
              <Button
                id={id}
                variant="ghost"
                className="text-danger hover:bg-danger-soft hover:text-danger"
                onClick={() => dialogs.openRemove()}
              >
                {t('lock.removeConfirm')}
              </Button>
            )}
          />
        </>
      )}
      <p className="border-line text-ink-3 border-t px-4 py-3 text-xs">{t('lock.privacyNote')}</p>
    </Group>
  );
}
