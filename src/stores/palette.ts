import { create } from 'zustand';

/* La command palette: una sola, aperta da Ctrl+K, dal campo nella barra del
   titolo o dalla scorciatoia globale (che porta avanti la finestra). */

interface PaletteState {
  open: boolean;
  /** Testo con cui aprirla (per esempio ">" per i soli comandi). */
  initialText: string;
  show: (initialText?: string) => void;
  hide: () => void;
  toggle: () => void;
}

export const usePalette = create<PaletteState>((set, get) => ({
  open: false,
  initialText: '',
  show: (initialText = '') => set({ open: true, initialText }),
  hide: () => set({ open: false, initialText: '' }),
  toggle: () => (get().open ? get().hide() : get().show()),
}));
