import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Keyboard } from 'lucide-react';
import { Button, GlassPanel } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ipc, isTauri, type ShortcutKind } from '@/lib/ipc';
import { useSessionStore } from '@/stores/sessionStore';
import { SettingRow } from '../SettingRow';
import type { ShortcutStatus } from '@/types/domain';

/** Traduce un evento di tastiera nella sintassi degli acceleratori di Tauri. */
function toAccelerator(event: React.KeyboardEvent): string | null {
  const modifiers: string[] = [];
  if (event.ctrlKey || event.metaKey) modifiers.push('CmdOrCtrl');
  if (event.altKey) modifiers.push('Alt');
  if (event.shiftKey) modifiers.push('Shift');

  const code = event.code;
  let key: string | null = null;

  if (code.startsWith('Key')) key = code.slice(3);
  else if (code.startsWith('Digit')) key = code.slice(5);
  else if (/^F\d{1,2}$/.test(code)) key = code;
  else if (code === 'Space') key = 'Space';
  else if (code === 'Enter') key = 'Enter';
  else if (code === 'Backquote') key = '`';

  // Un acceleratore globale senza modificatori si mangerebbe un tasto in tutto
  // il sistema: non lo accettiamo.
  if (!key || modifiers.length === 0) return null;

  return [...modifiers, key].join('+');
}

function ShortcutField({
  kind,
  value,
  onRegistered,
}: {
  kind: ShortcutKind;
  value: string;
  onRegistered: (accelerator: string) => void;
}) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState<ShortcutStatus | null>(null);

  useEffect(() => {
    if (!isTauri()) return;
    void ipc
      .getShortcutStatus(kind)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [kind]);

  const record = (event: React.KeyboardEvent) => {
    event.preventDefault();
    const accelerator = toAccelerator(event);
    if (!accelerator) return;

    setRecording(false);
    if (!isTauri()) return;

    void ipc.applyGlobalShortcut(kind, accelerator).then((result) => {
      setStatus(result);
      if (result.registered) onRegistered(accelerator);
    });
  };

  const failed = status && !status.registered;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onKeyDown={recording ? record : undefined}
        onBlur={() => setRecording(false)}
        onClick={() => setRecording(true)}
        className={cn(
          'flex items-center gap-2 rounded-xl px-3 py-2 font-mono text-xs transition-colors',
          recording
            ? 'bg-indigo-500/20 text-indigo-600 ring-2 ring-indigo-400/40 dark:text-indigo-300'
            : 'bg-black/[0.05] text-zinc-700 hover:bg-black/[0.09] dark:bg-white/[0.07] dark:text-zinc-200 dark:hover:bg-white/[0.12]',
        )}
      >
        <Keyboard strokeWidth={1.75} className="size-3.5" />
        {recording ? t('settings.pressKeys') : value}
        {!recording && status?.registered && (
          <Check strokeWidth={2.5} className="size-3 text-emerald-500" />
        )}
      </button>

      {failed && (
        <span className="flex max-w-64 items-start gap-1.5 text-right text-[0.6875rem] text-orange-600 dark:text-orange-400">
          <AlertTriangle strokeWidth={2} className="mt-0.5 size-3 shrink-0" />
          {t('settings.shortcutFailed')}
        </span>
      )}
    </div>
  );
}

export function ShortcutsTab() {
  const { t } = useTranslation();
  const settings = useSessionStore((state) => state.settings);
  const updateSetting = useSessionStore((state) => state.updateSetting);

  if (!settings) return <></>;

  return (
    <div className="flex flex-col gap-4">
      <GlassPanel radius="3xl" className="divide-y divide-black/5 dark:divide-white/[0.06]">
        <SettingRow
          title={t('settings.globalShortcut')}
          description={t('settings.globalShortcutDesc')}
        >
          <ShortcutField
            kind="palette"
            value={settings.globalShortcut}
            onRegistered={(accelerator) => void updateSetting('globalShortcut', accelerator)}
          />
        </SettingRow>

        <SettingRow title={t('capture.shortcut')} description={t('capture.shortcutDesc')}>
          <ShortcutField
            kind="capture"
            value={settings.captureShortcut}
            onRegistered={(accelerator) => void updateSetting('captureShortcut', accelerator)}
          />
        </SettingRow>
      </GlassPanel>

      <p className="px-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
        {t('settings.shortcutHint')}
      </p>
      <p className="px-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-500">
        {t('profiles.scopeHint')}
      </p>

      <div className="flex justify-start px-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void ipc.applyGlobalShortcut('palette', 'CmdOrCtrl+Space');
            void ipc.applyGlobalShortcut('capture', 'CmdOrCtrl+Shift+L');
            void updateSetting('globalShortcut', 'CmdOrCtrl+Space');
            void updateSetting('captureShortcut', 'CmdOrCtrl+Shift+L');
          }}
        >
          {t('settings.resetShortcuts')}
        </Button>
      </div>
    </div>
  );
}
