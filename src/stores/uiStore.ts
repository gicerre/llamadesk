import { create } from 'zustand';

interface UiState {
  /** Command Palette (CTRL+SPACE). */
  isPaletteOpen: boolean;
  /** Testo con cui la palette si apre: vuoto di norma, un tag dalla dashboard. */
  paletteQuery: string;
  openPalette: (query?: string) => void;
  closePalette: () => void;
  togglePalette: () => void;

  isSidebarCollapsed: boolean;
  toggleSidebar: () => void;

  /** Ramo attualmente aperto nel navigator, per il breadcrumb. */
  activePath: string[];
  setActivePath: (path: string[]) => void;
}

export const useUiStore = create<UiState>((set) => ({
  isPaletteOpen: false,
  paletteQuery: '',
  openPalette: (query = '') => set({ isPaletteOpen: true, paletteQuery: query }),
  closePalette: () => set({ isPaletteOpen: false }),
  togglePalette: () => set((state) => ({ isPaletteOpen: !state.isPaletteOpen, paletteQuery: '' })),

  isSidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ isSidebarCollapsed: !state.isSidebarCollapsed })),

  activePath: [],
  setActivePath: (activePath) => set({ activePath }),
}));
