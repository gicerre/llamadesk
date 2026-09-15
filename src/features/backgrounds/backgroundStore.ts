import { create } from 'zustand';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ipc, isTauri } from '@/lib/ipc';
import { useSessionStore } from '@/stores/sessionStore';
import type { Background } from '@/types/domain';

/* ============================================================================
   Sfondi.

   Su Windows `backdrop-filter` non può sfocare il desktop dietro la finestra:
   sfoca solo ciò che sta dentro la webview. Questo strato non è quindi una
   decorazione, è la superficie che ogni pannello in vetro campiona.
   ========================================================================== */

/** Gradienti inclusi nell'app: nessun file, nessun peso sul bundle. */
export const BUILTIN_GRADIENTS: { id: string; name: string; value: string }[] = [
  {
    id: 'aurora',
    name: 'Aurora',
    value:
      'radial-gradient(at 20% 20%, #7C7CF0 0px, transparent 55%), radial-gradient(at 80% 10%, #8B5CF6 0px, transparent 50%), radial-gradient(at 60% 90%, #22D3EE 0px, transparent 55%)',
  },
  {
    id: 'ember',
    name: 'Ember',
    value:
      'radial-gradient(at 15% 80%, #F97316 0px, transparent 50%), radial-gradient(at 75% 25%, #DB2777 0px, transparent 50%), radial-gradient(at 50% 50%, #7C2D12 0px, transparent 60%)',
  },
  {
    id: 'moss',
    name: 'Moss',
    value:
      'radial-gradient(at 10% 30%, #10B981 0px, transparent 50%), radial-gradient(at 85% 70%, #0EA5E9 0px, transparent 50%), radial-gradient(at 40% 95%, #065F46 0px, transparent 55%)',
  },
  {
    id: 'slate',
    name: 'Slate',
    value:
      'radial-gradient(at 25% 15%, #475569 0px, transparent 55%), radial-gradient(at 80% 60%, #1E293B 0px, transparent 50%), radial-gradient(at 50% 100%, #334155 0px, transparent 55%)',
  },
];

interface BackgroundState {
  backgrounds: Background[];
  load: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useBackgroundStore = create<BackgroundState>((set, get) => ({
  backgrounds: [],

  load: async () => {
    if (!isTauri()) return;
    try {
      set({ backgrounds: await ipc.listBackgrounds() });
    } catch {
      set({ backgrounds: [] });
    }
  },

  remove: async (id) => {
    await ipc.deleteBackground(id);
    await get().load();
  },
}));

/** Come disegnare uno sfondo: il file passa dal protocollo asset di Tauri. */
export function backgroundStyle(background: Background | null): React.CSSProperties {
  if (!background) return {};

  switch (background.source) {
    case 'file':
      return {
        backgroundImage: `url("${isTauri() ? convertFileSrc(background.value) : background.value}")`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    case 'gradient':
    case 'builtin':
      return { backgroundImage: background.value };
    case 'solid':
      return { backgroundColor: background.value };
    default:
      return {};
  }
}

/**
 * Sfondo effettivo. `settings.backgroundId` arriva dal backend già risolto:
 * globale, oppure l'override del profilo attivo se ne ha uno. Un secondo
 * meccanismo qui (la vecchia colonna `profiles.background_id`) potrebbe solo
 * entrare in conflitto con quello.
 *
 * `null` significa "usa il mesh gradient animato di default".
 */
export function resolveActiveBackground(backgrounds: Background[]): Background | null {
  const id = useSessionStore.getState().settings?.backgroundId ?? null;
  return backgrounds.find((background) => background.id === id) ?? null;
}
