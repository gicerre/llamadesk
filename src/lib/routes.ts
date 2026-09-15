import type { Crumb } from '@/types/generated/Crumb';

/* ============================================================================
   Indirizzi dell'applicazione (docs/REDESIGN.md § 6).

   Il workspace e' sempre nell'indirizzo, anche dentro un progetto: lo stesso
   progetto condiviso mostra percorso e accento del workspace da cui ci si e'
   arrivati. Sottoprogetto e sezione a fuoco sono segmenti facoltativi.
   ========================================================================== */

export interface NodeRouteParams {
  workspaceId?: string;
  projectId?: string;
  subprojectId?: string;
  sectionId?: string;
}

export const paths = {
  root: '/',
  welcome: '/benvenuto',
  settings: '/impostazioni',
  workspace: (workspaceId: string) => `/w/${workspaceId}`,
  favorites: (workspaceId: string) => `/w/${workspaceId}/preferiti`,
  recents: (workspaceId: string) => `/w/${workspaceId}/recenti`,
};

/** Indirizzo di un punto della gerarchia, dato il suo percorso dalla radice. */
export function routeForChain(workspaceId: string, chain: readonly Pick<Crumb, 'id' | 'kind'>[]) {
  const project = chain.find((crumb) => crumb.kind === 'project');
  const subproject = chain.find((crumb) => crumb.kind === 'subproject');
  const last = chain.at(-1);
  const section = last?.kind === 'section' ? last : undefined;

  let route = paths.workspace(workspaceId);
  if (project) route += `/p/${project.id}`;
  if (subproject) route += `/s/${subproject.id}`;
  if (section) route += `/n/${section.id}`;
  return route;
}

/** Il nodo mostrato dalla pagina: il segmento piu' profondo presente. */
export function currentNodeId(params: NodeRouteParams): string | undefined {
  return params.sectionId ?? params.subprojectId ?? params.projectId ?? params.workspaceId;
}

/** Il workspace dell'indirizzo, se la pagina ne ha uno. */
export function workspaceFromPath(pathname: string): string | undefined {
  return parseNodeRoute(pathname).workspaceId;
}

/**
 * Legge i segmenti di un indirizzo della libreria. Serve a chi sta sopra le
 * rotte (shell, sidebar) e quindi non riceve i loro parametri.
 */
export function parseNodeRoute(pathname: string): NodeRouteParams {
  const match = /^\/w\/([^/]+)(?:\/p\/([^/]+))?(?:\/s\/([^/]+))?(?:\/n\/([^/]+))?\/?$/.exec(
    pathname,
  );
  if (!match) {
    const workspaceOnly = /^\/w\/([^/]+)\//.exec(pathname);
    return workspaceOnly ? { workspaceId: workspaceOnly[1] } : {};
  }
  const [, workspaceId, projectId, subprojectId, sectionId] = match;
  return {
    workspaceId,
    ...(projectId && { projectId }),
    ...(subprojectId && { subprojectId }),
    ...(sectionId && { sectionId }),
  };
}
