import { useLocation } from 'react-router-dom';
import { useWorkspaces } from '@/lib/queries';
import { currentNodeId, parseNodeRoute } from '@/lib/routes';
import { useUi } from '@/stores/ui';

/**
 * Dove si trova l'utente, per chi sta sopra le rotte (shell e sidebar):
 * workspace di contesto e nodo mostrato.
 *
 * Le pagine senza workspace nell'indirizzo (Impostazioni) ereditano l'ultimo
 * visitato, poi il predefinito del profilo.
 */
export function useLocationContext() {
  const { pathname } = useLocation();
  const route = parseNodeRoute(pathname);
  const lastWorkspaceId = useUi((state) => state.lastWorkspaceId);
  const workspaces = useWorkspaces();
  const list = workspaces.data ?? [];

  const workspace =
    list.find((entry) => entry.node.id === route.workspaceId) ??
    (route.workspaceId ? undefined : list.find((entry) => entry.node.id === lastWorkspaceId)) ??
    (route.workspaceId ? undefined : (list.find((entry) => entry.isDefault) ?? list[0]));

  return {
    pathname,
    route,
    workspaces: list,
    workspacesLoading: workspaces.isLoading,
    workspace: workspace ?? null,
    workspaceId: workspace?.node.id ?? route.workspaceId ?? null,
    /** Il nodo della pagina, se e' una pagina della libreria. */
    nodeId: currentNodeId(route),
  };
}
