import { create } from 'zustand';

/* Stato dell'interfaccia che non appartiene a nessuna pagina. Solo comodita'
   di chi guarda: se il salvataggio locale non funziona, i default bastano. */

const STORAGE_KEY = 'llamadesk.ui';

interface Persisted {
  sidebarCollapsed: boolean;
  /** Progetti espansi nella sidebar, per workspace. */
  expanded: Record<string, string[]>;
  /** L'ultimo workspace visitato: da' contesto alle pagine che non ne hanno uno. */
  lastWorkspaceId: string | null;
}

const DEFAULTS: Persisted = { sidebarCollapsed: false, expanded: {}, lastWorkspaceId: null };

function load(): Persisted {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    // Archiviazione non disponibile: si riparte dai default.
  }
  return DEFAULTS;
}

function save({ sidebarCollapsed, expanded, lastWorkspaceId }: Persisted) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ sidebarCollapsed, expanded, lastWorkspaceId }),
    );
  } catch {
    // Non essenziale.
  }
}

interface UiState extends Persisted {
  toggleSidebar: () => void;
  toggleExpanded: (workspaceId: string, projectId: string, open?: boolean) => void;
  setLastWorkspace: (workspaceId: string) => void;
}

export const useUi = create<UiState>((set, get) => ({
  ...load(),

  toggleSidebar: () => {
    set({ sidebarCollapsed: !get().sidebarCollapsed });
    save(get());
  },

  toggleExpanded: (workspaceId, projectId, open) => {
    const current = new Set(get().expanded[workspaceId] ?? []);
    const shouldOpen = open ?? !current.has(projectId);
    if (shouldOpen) current.add(projectId);
    else current.delete(projectId);
    set({ expanded: { ...get().expanded, [workspaceId]: [...current] } });
    save(get());
  },

  setLastWorkspace: (workspaceId) => {
    if (get().lastWorkspaceId === workspaceId) return;
    set({ lastWorkspaceId: workspaceId });
    save(get());
  },
}));
