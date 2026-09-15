import { create } from 'zustand';

/* Dialoghi della protezione, apribili da ovunque: sblocco (anche da un
   errore `locked`), password (anche prima di proteggere qualcosa), password
   dimenticata o rimossa. */

export interface PasswordRequest {
  /** Dopo aver impostato la password, proteggi questo nodo. */
  protectNodeId?: string;
}

interface LockDialogs {
  unlock: boolean;
  password: PasswordRequest | null;
  remove: boolean;
  openUnlock: () => void;
  openPassword: (request?: PasswordRequest) => void;
  openRemove: () => void;
  close: () => void;
}

const CLOSED = { unlock: false, password: null, remove: false };

export const useLockDialogs = create<LockDialogs>((set) => ({
  ...CLOSED,
  openUnlock: () => set({ ...CLOSED, unlock: true }),
  openPassword: (request = {}) => set({ ...CLOSED, password: request }),
  openRemove: () => set({ ...CLOSED, remove: true }),
  close: () => set(CLOSED),
}));
