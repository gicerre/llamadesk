import { create } from 'zustand';
import {
  ipc,
  isTauri,
  type ApplicationPatch,
  type ContainerPatch,
  type LinkPatch,
} from '@/lib/ipc';
import { useSessionStore } from './sessionStore';
import type {
  Application,
  Container,
  ContainerKind,
  ContainerView,
  LinkKind,
  LinkUsage,
} from '@/types/domain';

/* ============================================================================
   Stato dei dati di dominio.

   Ogni mutazione passa da Rust e poi ricarica ciò che è visibile: preferiamo
   una ricarica (millisecondi, database locale) a una cache ottimistica che
   può divergere dalla verità. Le uniche eccezioni sono i riordini da drag &
   drop, dove l'attesa si vedrebbe.
   ========================================================================== */

interface DataState {
  containers: Container[];
  view: ContainerView | null;
  health: Record<string, LinkUsage>;
  isLoading: boolean;
  error: string | null;

  loadTree: () => Promise<void>;
  loadView: (containerId: string) => Promise<void>;
  loadHealth: () => Promise<void>;
  refresh: () => Promise<void>;

  createContainer: (
    parentId: string | null,
    kind: ContainerKind,
    name: string,
  ) => Promise<Container | null>;
  updateContainer: (id: string, patch: ContainerPatch) => Promise<void>;
  moveContainer: (
    id: string,
    parentId: string | null,
    previousId: string | null,
    nextId: string | null,
  ) => Promise<void>;
  deleteContainer: (id: string) => Promise<void>;
  duplicateContainer: (id: string, newName: string) => Promise<void>;

  createApplication: (containerId: string, name: string) => Promise<Application | null>;
  updateApplication: (id: string, patch: ApplicationPatch) => Promise<void>;
  deleteApplication: (id: string) => Promise<void>;
  duplicateApplication: (id: string, newName: string) => Promise<void>;
  reorderApplications: (
    containerId: string,
    orderedIds: string[],
    movedId: string,
  ) => Promise<void>;

  createLink: (applicationId: string, name: string, url: string, kind?: LinkKind) => Promise<void>;
  updateLink: (id: string, patch: LinkPatch) => Promise<void>;
  deleteLink: (id: string) => Promise<void>;
}

const activeProfileId = (): string | null => useSessionStore.getState().activeProfileId;

/** Stessa formula di `ordering::rank_between` in Rust. */
function rankBetween(previous: number | null, next: number | null): number {
  if (previous !== null && next !== null) return (previous + next) / 2;
  if (previous !== null) return previous + 1000;
  if (next !== null) return next - 1000;
  return 1000;
}

/** Lo stesso ordine di `list_containers`: `ORDER BY sort_order, name`. */
function byTreeOrder(a: Container, b: Container): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** Esegue una mutazione e ricarica la vista, con un solo punto di gestione errori. */
async function mutate(action: () => Promise<unknown>, after: () => Promise<void>): Promise<void> {
  await action();
  await after();
}

export const useDataStore = create<DataState>((set, get) => ({
  containers: [],
  view: null,
  health: {},
  isLoading: false,
  error: null,

  loadTree: async () => {
    const profileId = activeProfileId();
    if (!profileId || !isTauri()) return;

    set({ isLoading: true });
    try {
      set({ containers: await ipc.listContainers(profileId), error: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ isLoading: false });
    }
  },

  loadView: async (containerId) => {
    if (!isTauri()) return;
    set({ isLoading: true });
    try {
      set({ view: await ipc.getContainerView(containerId), error: null });
    } catch (error) {
      set({ view: null, error: error instanceof Error ? error.message : String(error) });
    } finally {
      set({ isLoading: false });
    }
  },

  loadHealth: async () => {
    const profileId = activeProfileId();
    if (!profileId || !isTauri()) return;

    try {
      const rows = await ipc.linkHealth(profileId);
      set({ health: Object.fromEntries(rows.map((row) => [row.linkId, row])) });
    } catch {
      // La salute dei link è un di più: se fallisce, l'app resta usabile.
    }
  },

  refresh: async () => {
    const { view, loadTree, loadView, loadHealth } = get();
    await loadTree();
    if (view) await loadView(view.container.id);
    await loadHealth();
  },

  /* ---------------------------------------------------------- contenitori */

  createContainer: async (parentId, kind, name) => {
    const profileId = activeProfileId();
    if (!profileId) return null;

    try {
      const created = await ipc.createContainer(profileId, parentId, kind, name);
      await get().refresh();
      return created;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  },

  updateContainer: async (id, patch) => {
    try {
      await mutate(() => ipc.updateContainer(id, patch), get().refresh);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  /**
   * Spostamento da drag & drop dell'albero: il nodo va subito al suo posto con
   * una posizione provvisoria fra i nuovi vicini, poi la ricarica rimette al
   * comando il database (che può aver anche ribilanciato i fratelli).
   */
  moveContainer: async (id, parentId, previousId, nextId) => {
    const current = get().containers;
    const rank = (neighbourId: string | null) =>
      current.find((node) => node.id === neighbourId)?.sortOrder ?? null;
    const sortOrder = rankBetween(rank(previousId), rank(nextId));

    set({
      containers: current
        .map((node) => (node.id === id ? { ...node, parentId, sortOrder } : node))
        .sort(byTreeOrder),
    });

    try {
      await mutate(() => ipc.moveContainer(id, parentId, previousId, nextId), get().refresh);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      await get().loadTree();
    }
  },

  deleteContainer: async (id) => {
    try {
      await mutate(() => ipc.deleteContainer(id), get().loadTree);
      if (get().view?.container.id === id) set({ view: null });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  duplicateContainer: async (id, newName) => {
    try {
      await mutate(() => ipc.duplicateContainer(id, newName), get().refresh);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  /* --------------------------------------------------------- applicazioni */

  createApplication: async (containerId, name) => {
    const profileId = activeProfileId();
    if (!profileId) return null;
    try {
      const created = await ipc.createApplication(profileId, containerId, name);
      await get().refresh();
      return created;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  },

  updateApplication: async (id, patch) => {
    try {
      await mutate(() => ipc.updateApplication(id, patch), get().refresh);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  deleteApplication: async (id) => {
    try {
      await mutate(() => ipc.deleteApplication(id), get().refresh);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  duplicateApplication: async (id, newName) => {
    try {
      await mutate(() => ipc.duplicateApplication(id, newName), get().refresh);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  /**
   * Riordino da drag & drop: la lista è già stata riordinata a schermo dal
   * componente, qui persistiamo scrivendo UNA sola posizione (quella
   * dell'elemento spostato) fra i suoi nuovi vicini.
   */
  reorderApplications: async (containerId, orderedIds, movedId) => {
    const index = orderedIds.indexOf(movedId);
    const previousId = index > 0 ? (orderedIds[index - 1] ?? null) : null;
    const nextId = index < orderedIds.length - 1 ? (orderedIds[index + 1] ?? null) : null;

    try {
      await ipc.moveApplication(movedId, containerId, previousId, nextId);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      await get().refresh();
    }
  },

  /* ----------------------------------------------------------------- link */

  createLink: async (applicationId, name, url, kind) => {
    try {
      await mutate(() => ipc.createLink(applicationId, name, url, kind), get().refresh);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  updateLink: async (id, patch) => {
    try {
      await mutate(() => ipc.updateLink(id, patch), get().refresh);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  deleteLink: async (id) => {
    try {
      await mutate(() => ipc.deleteLink(id), get().refresh);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },
}));
