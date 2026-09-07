import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { listen } from '@tauri-apps/api/event';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, CornerDownRight, Search } from 'lucide-react';
import { Button, Input, Modal, SearchInput } from '@/components/ui';
import { cn } from '@/lib/cn';
import { isTauri } from '@/lib/ipc';
import { useDataStore } from '@/stores/dataStore';
import { KIND_ICON } from '@/features/navigator/hierarchy';
import type { Container } from '@/types/domain';

const QUICK_CAPTURE_EVENT = 'llamadesk://quick-capture';

/**
 * Cattura rapida (default `Ctrl+Shift+L`).
 *
 * Rust legge gli appunti SOLO quando scatta la scorciatoia — mai in background
 * — valida l'URL e ci passa il risultato. Qui restano due sole domande: come
 * si chiama, e dove va.
 */
export function QuickCaptureDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const containers = useDataStore((state) => state.containers);
  const createApplication = useDataStore((state) => state.createApplication);
  const createLink = useDataStore((state) => state.createLink);
  const loadView = useDataStore((state) => state.loadView);

  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const [targetId, setTargetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;

    void listen<string | null>(QUICK_CAPTURE_EVENT, (event) => {
      setUrl(event.payload ?? '');
      setName('');
      setFilter('');
      setTargetId(null);
      setOpen(true);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, []);

  // Solo i contenitori che possono ospitare applicazioni: mettere un link in
  // un progetto vuoto, accanto ai suoi ambienti, non aiuta nessuno.
  const candidates = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return containers
      .filter((container) => container.kind !== 'project' || container.parentId !== null)
      .filter((container) => (needle ? container.name.toLowerCase().includes(needle) : true))
      .slice(0, 40);
  }, [containers, filter]);

  const canSave = url.trim().length > 0 && name.trim().length > 0 && !!targetId;

  const save = async () => {
    if (!canSave || !targetId) return;
    setBusy(true);
    try {
      await createApplication(targetId, name.trim());

      // L'applicazione appena creata è l'ultima del contenitore: la
      // ritroviamo ricaricando la vista, così il link finisce nel posto giusto.
      await loadView(targetId);
      const created = useDataStore
        .getState()
        .view?.applications.find((application) => application.name === name.trim());

      if (created) {
        await createLink(created.id, name.trim(), url.trim());
      }

      setOpen(false);
      navigate(`/c/${targetId}`);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <Modal open onClose={() => setOpen(false)} labelledBy="capture-title" className="max-w-xl">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-500">
            <ClipboardCheck strokeWidth={1.75} className="size-5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h2
              id="capture-title"
              className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              {t('capture.title')}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{t('capture.subtitle')}</p>
          </div>
        </div>

        {url.length === 0 && (
          <p className="rounded-xl bg-orange-500/10 px-3 py-2 text-xs text-orange-600 dark:text-orange-400">
            {t('capture.noUrl')}
          </p>
        )}

        <Input
          label={t('capture.url')}
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://…"
          className="font-mono text-xs"
        />

        <Input
          autoFocus
          label={t('editor.name')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('capture.namePlaceholder')}
        />

        <div className="flex flex-col gap-2">
          <span className="px-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {t('capture.destination')}
          </span>

          <SearchInput value={filter} onValueChange={setFilter} placeholder={t('nav.search')} />

          <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
            {candidates.map((container: Container) => (
              <li key={container.id}>
                <button
                  type="button"
                  onClick={() => setTargetId(container.id)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors',
                    targetId === container.id
                      ? 'bg-black/[0.07] dark:bg-white/[0.12]'
                      : 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
                  )}
                >
                  <span>{container.icon ?? KIND_ICON[container.kind]}</span>
                  <span className="flex-1 truncate">{container.name}</span>
                  <span className="text-[0.6875rem] text-zinc-400">
                    {t(`kinds.${container.kind}`)}
                  </span>
                  {targetId === container.id && (
                    <CornerDownRight strokeWidth={2} className="size-3.5 text-zinc-400" />
                  )}
                </button>
              </li>
            ))}

            {candidates.length === 0 && (
              <li className="flex items-center gap-2 px-3 py-4 text-xs text-zinc-400">
                <Search strokeWidth={1.75} className="size-3.5" />
                {t('capture.noDestination')}
              </li>
            )}
          </ul>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button variant="accent" onClick={() => void save()} disabled={!canSave} isLoading={busy}>
            {t('capture.save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
