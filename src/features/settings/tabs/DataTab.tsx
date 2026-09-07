import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { open, save } from '@tauri-apps/plugin-dialog';
import { Download, FileJson, Upload } from 'lucide-react';
import { Button, GlassPanel, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ipc, isTauri } from '@/lib/ipc';
import { useSessionStore } from '@/stores/sessionStore';
import { useDataStore } from '@/stores/dataStore';
import type { BackupPreview, ImportMode, ImportSummary } from '@/types/domain';

export function DataTab() {
  const { t } = useTranslation();
  const bootstrap = useSessionStore((state) => state.bootstrap);
  const refresh = useDataStore((state) => state.refresh);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<{ path: string; preview: BackupPreview } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const exportBackup = async () => {
    if (!isTauri()) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const path = await save({
      defaultPath: `llamadesk-backup-${stamp}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!path) return;

    setBusy(true);
    try {
      const bytes = await ipc.exportBackup(path);
      setMessage(t('data.exported', { size: Math.round(bytes / 1024) }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const chooseImport = async () => {
    if (!isTauri()) return;
    const selected = await open({
      multiple: false,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (typeof selected !== 'string') return;

    try {
      // Prima si guarda che cosa c'è dentro: importare alla cieca il file di
      // un collega è esattamente il momento in cui si perdono i propri dati.
      setPending({ path: selected, preview: await ipc.previewBackup(selected) });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const runImport = async (mode: ImportMode) => {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await ipc.importBackup(pending.path, mode);
      setPending(null);
      setSummary(result);
      await bootstrap();
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      setPending(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <GlassPanel radius="3xl" className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
            {t('data.title')}
          </span>
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            {t('data.description')}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void exportBackup()} isLoading={busy}>
            <Download strokeWidth={1.75} className="size-4" />
            {t('data.export')}
          </Button>
          <Button variant="ghost" onClick={() => void chooseImport()}>
            <Upload strokeWidth={1.75} className="size-4" />
            {t('data.import')}
          </Button>
        </div>

        {message && (
          <p className="rounded-xl bg-black/[0.04] px-3 py-2 text-xs text-zinc-600 dark:bg-white/[0.05] dark:text-zinc-300">
            {message}
          </p>
        )}
      </GlassPanel>

      {/* Anteprima e scelta della modalità */}
      <Modal open={!!pending} onClose={() => setPending(null)} labelledBy="import-title">
        {pending && (
          <div className="flex flex-col gap-5">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-500">
                <FileJson strokeWidth={1.75} className="size-5" />
              </span>
              <div className="flex flex-col gap-0.5">
                <h2
                  id="import-title"
                  className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
                >
                  {t('data.importTitle')}
                </h2>
                <span className="font-mono text-[0.6875rem] text-zinc-500">
                  {pending.preview.exportedAt} · v{pending.preview.appVersion}
                </span>
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              {(
                [
                  ['nav.projects', pending.preview.containers],
                  ['dashboard.widgets.favorites', pending.preview.applications],
                  ['editor.links', pending.preview.links],
                  ['nav.quickWorkspaces', pending.preview.bundles],
                ] as const
              ).map(([labelKey, count]) => (
                <div
                  key={labelKey}
                  className="flex flex-col rounded-xl bg-black/[0.04] px-3 py-2 dark:bg-white/[0.05]"
                >
                  <dt className="text-[0.625rem] text-zinc-500">{t(labelKey)}</dt>
                  <dd className="text-base font-semibold text-zinc-800 dark:text-zinc-100">
                    {count}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void runImport('merge')}
                className={cn(
                  'flex flex-col gap-0.5 rounded-2xl px-4 py-3 text-left transition-colors',
                  'bg-black/[0.04] hover:bg-black/[0.07] dark:bg-white/[0.05] dark:hover:bg-white/[0.09]',
                )}
              >
                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                  {t('data.merge')}
                </span>
                <span className="text-xs text-zinc-500">{t('data.mergeHint')}</span>
              </button>

              <button
                type="button"
                onClick={() => void runImport('replace')}
                className="flex flex-col gap-0.5 rounded-2xl bg-red-500/10 px-4 py-3 text-left transition-colors hover:bg-red-500/20"
              >
                <span className="text-sm font-medium text-red-600 dark:text-red-400">
                  {t('data.replace')}
                </span>
                <span className="text-xs text-red-600/80 dark:text-red-400/80">
                  {t('data.replaceHint')}
                </span>
              </button>
            </div>

            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setPending(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Riepilogo dell'importazione */}
      <Modal open={!!summary} onClose={() => setSummary(null)}>
        {summary && (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {t('data.importDone')}
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">
              {t('data.importSummary', {
                containers: summary.containers,
                applications: summary.applications,
                links: summary.links,
              })}
            </p>
            <div className="flex justify-end">
              <Button variant="accent" onClick={() => setSummary(null)}>
                {t('common.close')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
