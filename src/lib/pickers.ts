import { open } from '@tauri-apps/plugin-dialog';
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
