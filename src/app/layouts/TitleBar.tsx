import { useEffect, useState } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/cn';
import { isTauri } from '@/lib/ipc';

/**
 * Barra titolo custom: la finestra è `decorations: false`, quindi i controlli
 * sono nostri e restano coerenti con il vetro. La chiusura passa da Rust, che
 * decide se nascondere nella tray o uscire davvero.
 */
export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const appWindow = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    void appWindow.isMaximized().then(setIsMaximized);
    void appWindow
      .onResized(() => void appWindow.isMaximized().then(setIsMaximized))
      .then((fn) => {
        unlisten = fn;
      });

    return () => unlisten?.();
  }, []);

  const controls = [
    { icon: Minus, action: () => void getCurrentWindow().minimize(), label: 'Minimize' },
    {
      icon: isMaximized ? Copy : Square,
      action: () => void getCurrentWindow().toggleMaximize(),
      label: 'Maximize',
    },
    { icon: X, action: () => void getCurrentWindow().close(), label: 'Close', danger: true },
  ];

  return (
    <header className="drag-region flex h-11 shrink-0 items-center justify-between pl-4">
      <div className="flex items-center gap-2.5">
        <Logo size={18} />
        <span className="text-[0.8125rem] font-semibold tracking-tight text-zinc-700 dark:text-zinc-300">
          LlamaDesk
        </span>
      </div>

      {isTauri() && (
        <div className="no-drag flex h-full items-stretch">
          {controls.map(({ icon: Icon, action, label, danger }) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={action}
              className={cn(
                'flex w-12 items-center justify-center transition-colors duration-150',
                'text-zinc-500 dark:text-zinc-400',
                danger
                  ? 'hover:bg-red-500 hover:text-white'
                  : 'hover:bg-black/[0.06] dark:hover:bg-white/10',
              )}
            >
              <Icon strokeWidth={1.5} className="size-3.5" />
            </button>
          ))}
        </div>
      )}
    </header>
  );
}
