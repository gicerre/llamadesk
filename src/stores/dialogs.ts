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

export interface AddRequest {
  /** Contenitore di destinazione proposto. */
  parentId: string;
  workspaceId: string;
  /** Testo gia' pronto (per esempio incollato o trascinato). */
  initialText?: string;
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
  add: AddRequest | null;
  remove: DeleteRequest | null;
  newProfile: boolean;
  openCreate: (request: CreateRequest) => void;
  openAdd: (request: AddRequest) => void;
  openDelete: (request: DeleteRequest) => void;
  openNewProfile: () => void;
  close: () => void;
}

const CLOSED = { create: null, add: null, remove: null, newProfile: false };

export const useDialogs = create<DialogState>((set) => ({
  create: null,
  add: null,
  remove: null,
  newProfile: false,
  openCreate: (request) => set({ ...CLOSED, create: request }),
  openAdd: (request) => set({ ...CLOSED, add: request }),
  openDelete: (request) => set({ ...CLOSED, remove: request }),
  openNewProfile: () => set({ ...CLOSED, newProfile: true }),
  close: () => set(CLOSED),
}));
