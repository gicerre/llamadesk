import { create } from 'zustand';

/* Animazione di apertura (docs/REDESIGN.md § 11). Solo all'avvio a freddo:
   una volta per caricamento della pagina, mai al ritorno dalla tray (la
   pagina non si ricarica). `replay` la ripete a richiesta dalla palette. */

export type OpenerPhase =
  /** Non ancora deciso (bootstrap in corso). */
  | 'pending'
  /** Il simbolo si costruisce al centro; l'accento resta Titicaca. */
  | 'build'
  /** Il simbolo vola verso la barra del titolo, la shell compare. */
  | 'fly'
  | 'done';

interface OpenerState {
  phase: OpenerPhase;
  run: number;
  /** Primo avvio: l'apertura dura di piu', perche' la si guarda davvero. */
  slow: boolean;
  setPhase: (phase: OpenerPhase, slow?: boolean) => void;
  replay: () => void;
}

export const useOpener = create<OpenerState>((set, get) => ({
  phase: 'pending',
  run: 0,
  slow: false,
  setPhase: (phase, slow) => set(slow === undefined ? { phase } : { phase, slow }),
  replay: () => set({ phase: 'build', run: get().run + 1 }),
}));
