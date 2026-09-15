import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DatabaseBackup, FolderOpen, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { api, isTauri } from '@/lib/ipc';
import { pickBackupFile, pickBackupDestination } from '@/lib/pickers';
import { formatBytes } from '@/lib/resources';
import { useSession } from '@/stores/session';
import { toast, toastError } from '@/stores/toasts';
import type { BackupInfo } from '@/types/generated/BackupInfo';
import { Group } from './parts';

/**
 * Dati: dove stanno, backup automatici e manuali, ripristino. Un backup e' il
 * database intero; il ripristino avviene al riavvio, conservando quello attuale.
 */
export function DataSettings() {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const dbPath = useSession((state) => state.dbPath);
  const [restoring, setRestoring] = useState<string | null>(null);
  const backups = useQuery({ queryKey: ['backups'], queryFn: () => api.listBackups() });
  const format = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const create = async (destination: string | null) => {
    try {
      const created = await api.createBackup(destination);
      await client.invalidateQueries({ queryKey: ['backups'] });
      toast({ title: t('data.created', { name: created.fileName }) });
    } catch (error) {
      toastError(t('data.createFailed'), error);
    }
  };

  const saveCopy = async () => {
    const destination = await pickBackupDestination();
    if (destination) await create(destination);
  };

  const restoreFromFile = async () => {
    const path = await pickBackupFile();
    if (path) setRestoring(path);
  };

  return (
    <Group title={t('data.title')}>
      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="text-ink-3 text-xs">{t('data.hint')}</p>
        <p className="selectable text-ink-2 font-mono text-xs break-all">{dbPath}</p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void create(null)}>
            <DatabaseBackup />
            {t('data.backupNow')}
          </Button>
          {isTauri() && (
            <>
              <Button variant="ghost" onClick={() => void saveCopy()}>
                <Save />
                {t('data.saveCopy')}
              </Button>
              <Button variant="ghost" onClick={() => void restoreFromFile()}>
                <RotateCcw />
                {t('data.restoreFile')}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  void api.revealBackups().catch((error) => toastError(t('data.openFailed'), error))
                }
              >
                <FolderOpen />
                {t('data.openFolder')}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="px-4 py-3">
        <p className="text-ink-2 mb-1.5 text-xs font-semibold">{t('data.list')}</p>
        {(backups.data ?? []).length === 0 ? (
          <p className="text-ink-3 text-sm">{t('data.none')}</p>
        ) : (
          <ul className="flex flex-col">
            {(backups.data ?? []).slice(0, 10).map((backup: BackupInfo) => (
              <li key={backup.path} className="flex min-h-10 items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-sm tabular-nums">
                    {format.format(new Date(backup.modifiedAt * 1000))}
                  </span>
                  <span className="text-2xs text-ink-3 block truncate">
                    {backup.automatic ? t('data.automatic') : t('data.manual')} ·{' '}
                    {formatBytes(backup.sizeBytes, i18n.language)}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setRestoring(backup.path)}>
                  {t('data.restore')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {restoring && <RestoreDialog path={restoring} onClose={() => setRestoring(null)} />}
    </Group>
  );
}

function RestoreDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      // L'app si riavvia: questa chiamata non torna se va a buon fine.
      await api.restoreBackup(path);
    } catch (error) {
      setBusy(false);
      toastError(t('data.restoreFailed'), error);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('data.restoreTitle')}
      description={t('data.restoreDescription')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void confirm()}>
            {t('data.restoreConfirm')}
          </Button>
        </>
      }
    >
      <p className="selectable bg-hover text-ink-2 rounded-md px-3 py-2 font-mono text-xs break-all">
        {path}
      </p>
    </Dialog>
  );
}
