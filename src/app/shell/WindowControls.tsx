import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Copy, Minus, Square, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { isTauri } from '@/lib/ipc';

/** Controlli della finestra in stile Windows: 46px, rosso solo sulla chiusura. */
export function WindowControls() {
  const { t } = useTranslation();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    const appWindow = getCurrentWindow();
    void appWindow.isMaximized().then(setMaximized);
    const pending = appWindow.onResized(() => void appWindow.isMaximized().then(setMaximized));
    return () => void pending.then((unlisten) => unlisten());
  }, []);

  if (!isTauri()) return <div className="w-2" />;

  const control =
    'flex h-10 w-[46px] items-center justify-center text-ink-2 transition-colors duration-120 [&_svg]:size-4';

  return (
    <div className="flex h-full items-stretch">
      <button
        type="button"
        aria-label={t('shell.minimize')}
        onClick={() => void getCurrentWindow().minimize()}
        className={cn(control, 'hover:bg-hover')}
      >
        <Minus strokeWidth={1.5} />
      </button>
      <button
        type="button"
        aria-label={maximized ? t('shell.restore') : t('shell.maximize')}
        onClick={() => void getCurrentWindow().toggleMaximize()}
        className={cn(control, 'hover:bg-hover')}
      >
        {maximized ? (
          <Copy strokeWidth={1.5} className="size-3.5! -scale-x-100" />
        ) : (
          <Square strokeWidth={1.5} className="size-3.5!" />
        )}
      </button>
      <button
        type="button"
        aria-label={t('shell.close')}
        onClick={() => void getCurrentWindow().close()}
        className={cn(control, 'hover:bg-[#c42b1c] hover:text-white')}
      >
        <X strokeWidth={1.5} />
      </button>
    </div>
  );
}
