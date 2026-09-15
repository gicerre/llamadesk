import { create } from 'zustand';

/* Pannello di dettaglio: l'unico posto in cui si modifica un elemento
   (docs/REDESIGN.md § 6). Le pagine servono a usare, il pannello a configurare. */

interface InspectorState {
  nodeId: string | null;
  /** Workspace da cui lo si guarda: decide percorso e accento. */
  workspaceId: string | null;
  open: (nodeId: string, workspaceId: string) => void;
  close: () => void;
}

export const useInspector = create<InspectorState>((set) => ({
  nodeId: null,
  workspaceId: null,
  open: (nodeId, workspaceId) => set({ nodeId, workspaceId }),
  close: () => set({ nodeId: null, workspaceId: null }),
}));
