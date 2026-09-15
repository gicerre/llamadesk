import { open, save } from '@tauri-apps/plugin-dialog';
import { isTauri } from './ipc';

/**
 * Selettori di sistema per file e cartelle. Fuori da Tauri (anteprima nel
 * browser) non esistono: si restituisce `null` e l'interfaccia lo sa gia'.
 */
export const canPickPaths = isTauri;

export async function pickPaths(options: {
  directory: boolean;
  multiple: boolean;
}): Promise<string[]> {
  if (!isTauri()) return [];
  const result = await open({ directory: options.directory, multiple: options.multiple });
  if (result === null) return [];
  return Array.isArray(result) ? result : [result];
}

const DATABASE_FILTER = [{ name: 'LlamaDesk', extensions: ['db'] }];

/** Dove salvare una copia del database. */
export async function pickBackupDestination(): Promise<string | null> {
  if (!isTauri()) return null;
  const stamp = new Date().toISOString().slice(0, 10);
  return save({ defaultPath: `llamadesk-${stamp}.db`, filters: DATABASE_FILTER });
}

/** Un backup da ripristinare. */
export async function pickBackupFile(): Promise<string | null> {
  if (!isTauri()) return null;
  const result = await open({ multiple: false, directory: false, filters: DATABASE_FILTER });
  return typeof result === 'string' ? result : null;
}

/** Un'immagine per la cover. */
export async function pickImage(): Promise<string | null> {
  if (!isTauri()) return null;
  const result = await open({
    multiple: false,
    directory: false,
    filters: [{ name: 'Immagini', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  });
  return typeof result === 'string' ? result : null;
}
