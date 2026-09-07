import { create } from 'zustand';
import { ipc, isTauri } from '@/lib/ipc';
import { requiresConfirmation } from './prompt';
import type { BulkOpenPlan, OpenIntent } from '@/types/domain';

/* ============================================================================
   Orchestrazione dell'apertura dei link.

   Qualsiasi punto dell'app chiama `requestOpen(linkId)`; se il link è protetto
   il modale compare da sé, perché vive una volta sola nella shell. Nessun
   componente decide autonomamente se chiedere conferma — e comunque il backend
   rifiuterebbe un'apertura protetta senza conferma.
   ========================================================================== */

interface OpenState {
  intent: OpenIntent | null;
  plan: BulkOpenPlan | null;
  error: string | null;
  /** Chiamato dopo un'apertura riuscita: serve a rinfrescare i "Recenti". */
  onOpened: (() => void) | null;

  setOnOpened: (callback: (() => void) | null) => void;
  requestOpen: (linkId: string) => Promise<void>;
  requestOpenMany: (linkIds: string[]) => Promise<void>;
  confirmSingle: () => Promise<void>;
  confirmMany: (linkIds: string[]) => Promise<void>;
  cancel: () => void;
  clearError: () => void;
}

export const useOpenStore = create<OpenState>((set, get) => ({
  intent: null,
  plan: null,
  error: null,
  onOpened: null,

  setOnOpened: (onOpened) => set({ onOpened }),

  requestOpen: async (linkId) => {
    if (!isTauri()) return;
    try {
      const intent = await ipc.prepareOpen(linkId);

      if (requiresConfirmation(intent.danger.level)) {
        set({ intent });
        return;
      }

      await ipc.openLink(linkId, false);
      get().onOpened?.();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  requestOpenMany: async (linkIds) => {
    if (!isTauri() || linkIds.length === 0) return;
    try {
      const plan = await ipc.prepareOpenMany(linkIds);

      if (plan.protected.length > 0) {
        set({ plan });
        return;
      }

      await ipc.openLinks(plan.safeLinkIds, false);
      get().onOpened?.();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  confirmSingle: async () => {
    const { intent } = get();
    if (!intent) return;
    set({ intent: null });
    try {
      await ipc.openLink(intent.linkId, true);
      get().onOpened?.();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  confirmMany: async (linkIds) => {
    set({ plan: null });
    if (linkIds.length === 0) return;
    try {
      await ipc.openLinks(linkIds, true);
      get().onOpened?.();
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  cancel: () => set({ intent: null, plan: null }),
  clearError: () => set({ error: null }),
}));
