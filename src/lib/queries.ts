import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/ipc';
import { useProfileId } from '@/stores/session';
import type { ToolKind } from '@/types/generated/ToolKind';
import type { NewNode } from '@/types/generated/NewNode';
import type { NodePatch } from '@/types/generated/NodePatch';
import type { PathInfo } from '@/types/generated/PathInfo';

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
  paths: (paths: readonly string[]) => ['paths', ...[...paths].sort()] as const,
  tags: () => ['tags'] as const,
  tools: (includeHidden: boolean) => ['tools', includeHidden] as const,
  browserProfiles: (toolId: string) => ['browser-profiles', toolId] as const,
  toolPreferences: (profileId: string, nodeId: string | null, via: string | null) =>
    ['tool-preferences', profileId, nodeId, via] as const,
};

/** Tutto cio' che una modifica alla libreria puo' aver cambiato. */
export function invalidateLibrary(client = queryClient) {
  return Promise.all(
    ['workspaces', 'node', 'children', 'favorites', 'recents', 'tags'].map((key) =>
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

/**
 * Funzione stabile, fuori dal hook: con un `select` ricreato a ogni render
 * TanStack Query ricalcola la Map a ogni passaggio e la pagina non si ferma piu'.
 */
function indexByPath(infos: PathInfo[]) {
  return new Map(infos.map((info) => [info.path, info]));
}

/**
 * Che cosa c'e' sul disco dietro i percorsi di una pagina, in una sola
 * richiesta. Si ricontrolla quando la finestra torna in primo piano: nel
 * frattempo qualcuno puo' aver spostato un file.
 */
export function usePathInfos(paths: readonly string[]) {
  return useQuery({
    queryKey: keys.paths(paths),
    queryFn: () => api.inspectPaths([...paths]),
    enabled: paths.length > 0,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    select: indexByPath,
  });
}

export function useTags() {
  return useQuery({ queryKey: keys.tags(), queryFn: () => api.listTags() });
}

/** Una modifica qualsiasi alla libreria, con invalidazione e toast d'errore al chiamante. */
export function useLibraryMutation<TArgs, TResult>(run: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => invalidateLibrary(client),
  });
}

/* ------------------------------------------------------------- strumenti */

export function useTools(includeHidden = false) {
  return useQuery({
    queryKey: keys.tools(includeHidden),
    queryFn: () => api.tools(includeHidden),
    staleTime: 60_000,
  });
}

export function useBrowserProfiles(toolId: string | null | undefined) {
  return useQuery({
    queryKey: keys.browserProfiles(toolId ?? ''),
    queryFn: () => api.browserProfiles(toolId as string),
    enabled: !!toolId,
  });
}

/** Preferenze di strumento del profilo (`nodeId` null) o di un nodo. */
export function useToolPreferences(nodeId: string | null, via: string | null, enabled = true) {
  const profileId = useProfileId();
  return useQuery({
    queryKey: keys.toolPreferences(profileId, nodeId, via),
    queryFn: () => api.toolPreferences(profileId, nodeId, via),
    enabled: enabled && profileId !== '',
  });
}

export function invalidateTools(client = queryClient) {
  return Promise.all(
    ['tools', 'tool-preferences'].map((key) => client.invalidateQueries({ queryKey: [key] })),
  );
}

export function useSetToolPreference() {
  const profileId = useProfileId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      nodeId,
      kind,
      toolId,
    }: {
      nodeId: string | null;
      kind: ToolKind;
      toolId: string | null;
    }) => api.setToolPreference(profileId, nodeId, kind, toolId),
    onSuccess: () => client.invalidateQueries({ queryKey: ['tool-preferences'] }),
  });
}
