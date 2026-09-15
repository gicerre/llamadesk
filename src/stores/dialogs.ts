import { create } from 'zustand';
import type { NodeKind } from '@/types/generated/NodeKind';

/* ============================================================================
   Dialoghi condivisi: si aprono da qualunque punto (sidebar, pagine, menu)
   e vivono una volta sola nella shell, invece di un'istanza per pulsante.
   ========================================================================== */

export interface CreateRequest {
  kind: NodeKind;
  /** `null` solo per un workspace. */
  parentId: string | null;
  /** Workspace da cui si crea: dove andare dopo. */
  workspaceId: string | null;
}

export interface DeleteRequest {
  id: string;
  name: string;
  kind: NodeKind;
  /** Indirizzo in cui tornare se si stava guardando l'elemento eliminato. */
  fallbackRoute: string;
}

interface DialogState {
  create: CreateRequest | null;
  remove: DeleteRequest | null;
  newProfile: boolean;
  openCreate: (request: CreateRequest) => void;
  openDelete: (request: DeleteRequest) => void;
  openNewProfile: () => void;
  close: () => void;
}

export const useDialogs = create<DialogState>((set) => ({
  create: null,
  remove: null,
  newProfile: false,
  openCreate: (request) => set({ create: request, remove: null, newProfile: false }),
  openDelete: (request) => set({ remove: request, create: null, newProfile: false }),
  openNewProfile: () => set({ newProfile: true, create: null, remove: null }),
  close: () => set({ create: null, remove: null, newProfile: false }),
}));
