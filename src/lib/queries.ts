import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/ipc';
import { useProfileId } from '@/stores/session';
import type { NewNode } from '@/types/generated/NewNode';
import type { NodePatch } from '@/types/generated/NodePatch';

/* ============================================================================
   Dati della libreria via TanStack Query.

   Il database e' locale e risponde in millisecondi: invece di aggiornare la
   cache a mano dopo ogni modifica si invalida cio' che puo' essere cambiato e
   si rilegge. Una sola regola, nessuna cache che diverge dalla verita'.
   ========================================================================== */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Nessuna rete: niente tentativi ripetuti, niente ricariche al focus.
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export const keys = {
  workspaces: (profileId: string) => ['workspaces', profileId] as const,
  node: (profileId: string, id: string, via: string | null) =>
    ['node', profileId, id, via] as const,
  children: (id: string) => ['children', id] as const,
  favorites: (profileId: string) => ['favorites', profileId] as const,
  recents: (profileId: string, workspaceId: string | null) =>
    ['recents', profileId, workspaceId] as const,
};

/** Tutto cio' che una modifica alla libreria puo' aver cambiato. */
export function invalidateLibrary(client = queryClient) {
  return Promise.all(
    ['workspaces', 'node', 'children', 'favorites', 'recents'].map((key) =>
      client.invalidateQueries({ queryKey: [key] }),
    ),
  );
}

export function useWorkspaces() {
  const profileId = useProfileId();
  return useQuery({
    queryKey: keys.workspaces(profileId),
    queryFn: () => api.listWorkspaces(profileId),
    enabled: profileId !== '',
  });
}

export function useNodeView(id: string | undefined, via: string | null) {
  const profileId = useProfileId();
  return useQuery({
    queryKey: keys.node(profileId, id ?? '', via),
    queryFn: () => api.nodeView(profileId, id as string, via),
    enabled: profileId !== '' && !!id,
    placeholderData: (previous, previousQuery) =>
      // Durante il cambio di pagina teniamo i dati dello stesso nodo, non di un altro.
      previousQuery?.queryKey[2] === id ? previous : undefined,
  });
}

export function useChildren(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.children(id ?? ''),
    queryFn: () => api.children(id as string),
    enabled: enabled && !!id,
  });
}

export function useFavorites() {
  const profileId = useProfileId();
  return useQuery({
    queryKey: keys.favorites(profileId),
    queryFn: () => api.favorites(profileId),
    enabled: profileId !== '',
  });
}

export function useRecents(workspaceId: string | null) {
  const profileId = useProfileId();
  return useQuery({
    queryKey: keys.recents(profileId, workspaceId),
    queryFn: () => api.recents(profileId, workspaceId),
    enabled: profileId !== '',
  });
}

export function useCreateNode() {
  const profileId = useProfileId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ parentId, input }: { parentId: string | null; input: NewNode }) =>
      api.createNode(profileId, parentId, input),
    onSuccess: () => invalidateLibrary(client),
  });
}

export function useUpdateNode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: NodePatch }) => api.updateNode(id, patch),
    onSuccess: () => invalidateLibrary(client),
  });
}

export function useToggleFavorite() {
  const profileId = useProfileId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (nodeId: string) => api.toggleFavorite(profileId, nodeId),
    onSuccess: () => invalidateLibrary(client),
  });
}

export function useSetDefaultWorkspace() {
  const profileId = useProfileId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => api.setDefaultWorkspace(profileId, workspaceId),
    onSuccess: () => client.invalidateQueries({ queryKey: ['workspaces'] }),
  });
}
