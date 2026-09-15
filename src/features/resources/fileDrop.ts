import { create } from 'zustand';

/* ============================================================================
   Trascinare file e cartelle da Esplora risorse (docs/REDESIGN.md § 6).

   Ogni contenitore della pagina che accetta percorsi si dichiara con
   `useFileDropTarget`; il ponte in `FileDropBridge` ascolta la finestra, trova
   il contenitore sotto il puntatore e crea i percorsi li'.
   ========================================================================== */

interface FileDropState {
  /** Il contenitore sotto il puntatore durante un trascinamento dall'esterno. */
  hoverId: string | null;
  setHover: (id: string | null) => void;
}

export const useFileDrop = create<FileDropState>((set) => ({
  hoverId: null,
  setHover: (hoverId) => set({ hoverId }),
}));

export const FILE_DROP_ATTRIBUTE = 'data-file-drop';

/**
 * Dichiara un elemento come destinazione dei file trascinati da fuori: basta
 * spargere `targetProps` sull'elemento, che viene marcato con il suo contenitore.
 */
export function useFileDropTarget(containerId: string) {
  const active = useFileDrop((state) => state.hoverId === containerId);
  return { targetProps: { [FILE_DROP_ATTRIBUTE]: containerId }, active };
}

/** Il contenitore piu' interno sotto un punto della finestra (in px CSS). */
export function dropTargetAt(x: number, y: number): string | null {
  const element = document.elementFromPoint(x, y);
  return element?.closest(`[${FILE_DROP_ATTRIBUTE}]`)?.getAttribute(FILE_DROP_ATTRIBUTE) ?? null;
}
