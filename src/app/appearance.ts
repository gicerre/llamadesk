import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauri } from '@/lib/ipc';
import { BRAND_COLOR, normalizeHex } from '@/lib/identity';

export interface Appearance {
  theme: string;
  density: string;
  material: 'mica' | 'solid';
}

function prefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Scrive tema, densita' e materiale sull'<html>. Idempotente. */
export function applyAppearance({ theme, density, material }: Appearance) {
  const root = document.documentElement;
  const dark = theme === 'dark' || (theme !== 'light' && prefersDark());
  root.classList.toggle('dark', dark);
  root.dataset.density = density === 'compact' ? 'compact' : 'comfortable';
  root.dataset.material = material;

  // Mica segue il tema della finestra, non quello del sistema.
  if (isTauri()) {
    void getCurrentWindow()
      .setTheme(theme === 'system' ? null : dark ? 'dark' : 'light')
      .catch(() => undefined);
  }
}

export function setAccent(hex: string | null) {
  document.documentElement.style.setProperty('--ld-accent-base', normalizeHex(hex) ?? BRAND_COLOR);
}
