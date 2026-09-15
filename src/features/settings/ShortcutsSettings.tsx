import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';
import { cn } from '@/lib/cn';
import { acceleratorFromEvent, displayAccelerator } from '@/lib/accelerators';
import { api } from '@/lib/ipc';
import { useSession } from '@/stores/session';
import { toast, toastError } from '@/stores/toasts';
import { Group, Row } from './parts';

type Kind = 'palette' | 'capture';

/** Scorciatoie globali (configurabili) e quelle della finestra (promemoria). */
export function ShortcutsSettings() {
  const { t } = useTranslation();
  return (
    <Group title={t('shortcuts.title')}>
      <GlobalShortcutRow kind="palette" />
      <GlobalShortcutRow kind="capture" />
      <div className="px-4 py-3">
        <p className="text-ink-2 mb-2 text-xs font-semibold">{t('shortcuts.inApp')}</p>
        <dl className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-6 gap-y-1.5 text-sm">
          {(
            [
              ['Ctrl+K', 'search'],
              ['Ctrl+N', 'add'],
              ['Ctrl+I', 'inspector'],
              ['Ctrl+D', 'favorite'],
              ['Ctrl+B', 'sidebar'],
              ['Ctrl+L', 'lock'],
              ['Ctrl+1…9', 'workspace'],
              ['Alt+← / →', 'history'],
              [t('actions.enter'), 'open'],
              [t('actions.space'), 'details'],
              ['Alt+↑ / ↓', 'reorder'],
              ['F5', 'recheck'],
            ] as const
          ).map(([keys, id]) => (
            <div key={id} className="flex items-center justify-between gap-3">
              <dt className="text-ink-2 truncate">{t(`shortcuts.list.${id}`)}</dt>
              <dd>
                <Kbd>{keys}</Kbd>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Group>
  );
}

function GlobalShortcutRow({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const status = useQuery({
    queryKey: ['shortcut', kind],
    queryFn: () => api.shortcutStatus(kind),
  });

  const apply = async (accelerator: string) => {
    setRecording(false);
    setBusy(true);
    try {
      const result = await api.applyGlobalShortcut(kind, accelerator);
      client.setQueryData(['shortcut', kind], result);
      if (result.registered) {
        useSession.setState((state) => ({
          settings: state.settings && {
            ...state.settings,
            [kind === 'palette' ? 'globalShortcut' : 'captureShortcut']: accelerator,
          },
        }));
        toast({ title: t('shortcuts.saved', { keys: displayAccelerator(accelerator) }) });
      } else {
        toastError(t('shortcuts.failed'), new Error(result.error ?? ''));
      }
    } catch (error) {
      toastError(t('shortcuts.failed'), error);
    } finally {
      setBusy(false);
    }
  };

  const data = status.data;
  return (
    <Row
      label={t(`shortcuts.${kind}`)}
      hint={
        data && !data.registered
          ? t('shortcuts.notRegistered', { error: data.error ?? '' })
          : t(`shortcuts.${kind}Hint`)
      }
      control={(id) =>
        recording ? (
          <input
            id={id}
            autoFocus
            readOnly
            value={t('shortcuts.recording')}
            aria-label={t('shortcuts.recording')}
            onBlur={() => setRecording(false)}
            onKeyDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (event.key === 'Escape') {
                setRecording(false);
                return;
              }
              const accelerator = acceleratorFromEvent(event.nativeEvent);
              if (accelerator) void apply(accelerator);
            }}
            className="bg-accent-soft text-accent h-[30px] w-52 rounded-sm px-2.5 text-center text-sm font-semibold outline-none"
          />
        ) : (
          <span id={id} className="flex items-center gap-2">
            {data && (
              <Kbd className={cn(!data.registered && 'text-danger line-through')}>
                {displayAccelerator(data.accelerator)}
              </Kbd>
            )}
            <Button size="sm" disabled={busy} onClick={() => setRecording(true)}>
              {t('shortcuts.change')}
            </Button>
          </span>
        )
      }
    />
  );
}
