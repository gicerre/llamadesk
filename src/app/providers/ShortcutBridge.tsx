import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useUiStore } from '@/stores/uiStore';
import { isTauri } from '@/lib/ipc';

/** Evento emesso da Rust quando scatta la scorciatoia globale registrata nell'OS. */
export const TOGGLE_PALETTE_EVENT = 'llamadesk://toggle-palette';

/**
 * Doppio canale per la Command Palette:
 *  1. la scorciatoia globale registrata da Rust (funziona anche ad app in tray);
 *  2. un fallback a livello di finestra, così la palette risponde anche quando
 *     la registrazione globale è fallita perché il tasto era già occupato.
 */
export function ShortcutBridge() {
  const togglePalette = useUiStore((state) => state.togglePalette);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.code === 'Space') {
        event.preventDefault();
        togglePalette();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePalette]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;

    void listen(TOGGLE_PALETTE_EVENT, () => togglePalette()).then((fn) => {
      unlisten = fn;
    });

    return () => unlisten?.();
  }, [togglePalette]);

  return null;
}
