import type { CommandArgs, CommandName, CommandResult } from '@/lib/ipc';
import type { AppSettings } from '@/types/generated/AppSettings';
import type { Caution } from '@/types/generated/Caution';
import type { Crumb } from '@/types/generated/Crumb';
import type { NewNode } from '@/types/generated/NewNode';
import type { Node } from '@/types/generated/Node';
import type { NodeEntry } from '@/types/generated/NodeEntry';
import type { NodeKind } from '@/types/generated/NodeKind';
import type { Profile } from '@/types/generated/Profile';
import type { WorkspaceEntry } from '@/types/generated/WorkspaceEntry';

/* ============================================================================
   Backend simulato per l'anteprima nel browser (`npm run dev:vite`).

   Non entra mai nell'app vera: `ipc.ts` lo importa solo fuori da Tauri. Imita
   le regole principali di Rust quanto basta per disegnare e navigare
   l'interfaccia; la verita' resta nei test di `cargo test`.

   Parte con dati d'esempio (l'esempio SpecialHub del documento di
   riprogettazione). Nell'indirizzo: `?vuoto` parte da un database vuoto, come
   al primo avvio reale; `?tema=scuro` o `?tema=chiaro` forza il tema.
   ========================================================================== */

interface Edge {
  parent: string;
  child: string;
  sortOrder: number;
  pinned: boolean;
}

interface Visibility {
  profileId: string;
  workspaceId: string;
  sortOrder: number;
  isDefault: boolean;
  lastRoute: string | null;
  lastOpenedAt: string | null;
}

const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
let counter = 0;
// Id prevedibili: l'anteprima si puo' aprire su una pagina precisa (#/w/mock-0/p/mock-4).
const newId = () => `mock-${counter++}`;

const RULES: Record<NodeKind, NodeKind[]> = {
  workspace: ['project', 'section', 'link', 'link_group', 'path'],
  project: ['subproject', 'section', 'link', 'link_group', 'path'],
  subproject: ['section', 'link', 'link_group', 'path'],
  section: ['section', 'link', 'link_group', 'path'],
  link_group: ['link'],
  link: [],
  path: [],
};

const state = {
  settings: {
    theme: 'system',
    language: navigator.language.toLowerCase().startsWith('it') ? 'it' : 'en',
    density: 'comfortable',
    globalShortcut: 'CmdOrCtrl+Alt+Space',
    captureShortcut: 'CmdOrCtrl+Shift+L',
    startMinimized: false,
    closeToTray: true,
    autostart: false,
    openerAnimation: true,
    activeProfileId: null,
    openDelayMs: 250,
  } as AppSettings,
  firstRun: true,
  profiles: [] as Profile[],
  overrides: new Map<string, Map<string, unknown>>(),
  nodes: new Map<string, Node & { deletion: string | null }>(),
  edges: [] as Edge[],
  visibility: [] as Visibility[],
  favorites: [] as { profileId: string; nodeId: string }[],
};

/* ---------------------------------------------------------------- lettura */

function alive(id: string) {
  const node = state.nodes.get(id);
  return node && !node.deletion ? node : null;
}

function get(id: string): Node {
  const node = alive(id);
  if (!node) throw new Error(`elemento non trovato: ${id}`);
  return node;
}

function parentsOf(id: string): Node[] {
  return state.edges
    .filter((edge) => edge.child === id)
    .map((edge) => alive(edge.parent))
    .filter((node): node is Node & { deletion: null } => !!node)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function childrenOf(id: string, includeArchived = false): NodeEntry[] {
  return state.edges
    .filter((edge) => edge.parent === id)
    .map((edge) => ({ edge, node: alive(edge.child) }))
    .filter(({ node }) => node && (includeArchived || !node.archivedAt))
    .sort((a, b) => a.edge.sortOrder - b.edge.sortOrder)
    .map(({ edge, node }) => ({
      node: node as Node,
      sortOrder: edge.sortOrder,
      isPinned: edge.pinned,
      childCount: state.edges.filter((e) => e.parent === edge.child && alive(e.child)).length,
      parentCount: parentsOf(edge.child).length,
    }));
}

function ancestors(id: string): { node: Node; depth: number }[] {
  const found = new Map<string, { node: Node; depth: number }>();
  const walk = (current: string, depth: number) => {
    for (const parent of parentsOf(current)) {
      const known = found.get(parent.id);
      if (!known || known.depth > depth) found.set(parent.id, { node: parent, depth });
      walk(parent.id, depth + 1);
    }
  };
  walk(id, 1);
  return [...found.values()].sort((a, b) => a.depth - b.depth);
}

function workspacesOf(id: string): Node[] {
  const node = get(id);
  if (node.kind === 'workspace') return [node];
  return ancestors(id)
    .map((entry) => entry.node)
    .filter((entry) => entry.kind === 'workspace')
    .sort((a, b) => a.name.localeCompare(b.name));
}

const crumb = (node: Node): Crumb => ({
  id: node.id,
  kind: node.kind,
  name: node.name,
  icon: node.icon,
  colorMain: node.colorMain,
});

function breadcrumb(profileId: string, id: string, via: string | null): Crumb[] {
  const chain: Node[] = [get(id)];
  for (;;) {
    const current = chain[chain.length - 1] as Node;
    const parents = parentsOf(current.id);
    if (parents.length === 0) break;
    const reaches = (parent: Node) =>
      parent.id === via || ancestors(parent.id).some((entry) => entry.node.id === via);
    const visible = (parent: Node) =>
      workspacesOf(parent.id).some((workspace) =>
        state.visibility.some((v) => v.profileId === profileId && v.workspaceId === workspace.id),
      );
    chain.push(parents.find(reaches) ?? parents.find(visible) ?? (parents[0] as Node));
  }
  return chain.reverse().map(crumb);
}

const SEVERITY: Record<Caution, number> = { none: 0, confirm: 1, type_name: 2 };

/* -------------------------------------------------------------- scrittura */

function insertNode(profileId: string | null, input: NewNode): Node {
  const name = input.name.trim();
  if (!name) throw new Error("il nome non puo' essere vuoto");
  if (input.kind === 'link' && !/^(https?|mailto):/i.test(input.url ?? '')) {
    throw new Error('URL non valido: sono ammessi solo http, https e mailto');
  }
  const node: Node & { deletion: string | null } = {
    id: newId(),
    kind: input.kind,
    name,
    description: input.description ?? null,
    aliases: null,
    icon: input.icon ?? null,
    colorMain: input.colorMain ?? null,
    colorSecondary: null,
    coverAssetId: null,
    coverFocusX: 0.5,
    coverFocusY: 0.5,
    isProtected: false,
    caution: null,
    url: input.kind === 'link' ? (input.url ?? null) : null,
    path: input.kind === 'path' ? (input.path ?? null) : null,
    enabled: true,
    openMode: null,
    browserToolId: null,
    browserProfile: null,
    createdByProfileId: profileId,
    createdAt: now(),
    updatedAt: now(),
    archivedAt: null,
    deletion: null,
  };
  state.nodes.set(node.id, node);
  return node;
}

function attach(parentId: string, childId: string) {
  const parent = get(parentId);
  const child = get(childId);
  if (!RULES[parent.kind].includes(child.kind)) {
    throw new Error(`${child.kind} non puo' stare dentro ${parent.kind}`);
  }
  const siblings = state.edges.filter((edge) => edge.parent === parentId);
  const last = Math.max(0, ...siblings.map((edge) => edge.sortOrder));
  state.edges.push({ parent: parentId, child: childId, sortOrder: last + 1000, pinned: false });
}

function showWorkspace(profileId: string, workspaceId: string) {
  const mine = state.visibility.filter((v) => v.profileId === profileId);
  state.visibility.push({
    profileId,
    workspaceId,
    sortOrder: Math.max(0, ...mine.map((v) => v.sortOrder)) + 1000,
    isDefault: !mine.some((v) => v.isDefault && alive(v.workspaceId)),
    lastRoute: null,
    lastOpenedAt: null,
  });
}

function create(profileId: string, parentId: string | null, input: NewNode): Node {
  if (input.kind === 'workspace') {
    if (parentId) throw new Error('un workspace non sta dentro altri elementi');
    const node = insertNode(profileId, input);
    showWorkspace(profileId, node.id);
    return node;
  }
  if (!parentId) throw new Error('serve un contenitore');
  const node = insertNode(profileId, input);
  try {
    attach(parentId, node.id);
  } catch (error) {
    state.nodes.delete(node.id);
    throw error;
  }
  return node;
}

function deletionSet(id: string): string[] {
  const set = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of state.edges) {
      if (set.has(edge.child) || !set.has(edge.parent) || !alive(edge.child)) continue;
      if (parentsOf(edge.child).every((parent) => set.has(parent.id))) {
        set.add(edge.child);
        changed = true;
      }
    }
  }
  return [...set];
}

function promoteDefaults() {
  const profiles = new Set(state.visibility.map((v) => v.profileId));
  for (const profileId of profiles) {
    const mine = state.visibility
      .filter((v) => v.profileId === profileId && alive(v.workspaceId))
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (mine.length > 0 && !mine.some((v) => v.isDefault)) (mine[0] as Visibility).isDefault = true;
  }
}

function workspaceEntries(profileId: string, includeArchived: boolean): WorkspaceEntry[] {
  return state.visibility
    .filter((v) => v.profileId === profileId)
    .map((v) => ({ v, node: alive(v.workspaceId) }))
    .filter(({ node }) => node && (includeArchived || !node.archivedAt))
    .sort((a, b) => a.v.sortOrder - b.v.sortOrder)
    .map(({ v, node }) => ({
      node: node as Node,
      sortOrder: v.sortOrder,
      isDefault: v.isDefault,
      lastRoute: v.lastRoute,
      lastOpenedAt: v.lastOpenedAt,
      projectCount: childrenOf(v.workspaceId).filter((entry) => entry.node.kind === 'project')
        .length,
      profileCount: state.visibility.filter((other) => other.workspaceId === v.workspaceId).length,
    }));
}

function effectiveSettings(profileId: string | null): AppSettings {
  const overrides = profileId ? state.overrides.get(profileId) : undefined;
  return { ...state.settings, ...Object.fromEntries(overrides ?? []) } as AppSettings;
}

function session(profileId: string) {
  const profile = state.profiles.find((entry) => entry.id === profileId);
  if (!profile) throw new Error(`profilo non trovato: ${profileId}`);
  state.settings = { ...state.settings, activeProfileId: profileId };
  return {
    profile,
    settings: effectiveSettings(profileId),
    overrides: [...(state.overrides.get(profileId)?.keys() ?? [])],
  };
}

/* ------------------------------------------------------------------ seed */

function seed() {
  const it = state.settings.language === 'it';
  const profile: Profile = {
    id: 'mock-profile',
    name: it ? 'Personale' : 'Personal',
    description: null,
    avatarAssetId: null,
    colorMain: null,
    colorSecondary: null,
    hasLock: false,
    lockAutoMinutes: 10,
    sortOrder: 1000,
    createdAt: now(),
    updatedAt: now(),
  };
  state.profiles.push(profile);
  state.settings.activeProfileId = profile.id;

  const query = new URLSearchParams(window.location.search);
  if (query.get('tema') === 'scuro') state.settings.theme = 'dark';
  if (query.get('tema') === 'chiaro') state.settings.theme = 'light';
  if (query.has('vuoto')) return;
  state.firstRun = false;

  const p = profile.id;
  const ws = (name: string, colorMain: string, description?: string) =>
    create(p, null, { kind: 'workspace', name, colorMain, description });
  const add = (parent: Node, kind: NodeKind, name: string, extra: Partial<NewNode> = {}) =>
    create(p, parent.id, { kind, name, ...extra });

  const work = ws(
    it ? 'Lavoro' : 'Work',
    '#3C62C4',
    it ? 'Clienti, piattaforme e riunioni' : 'Clients, platforms and meetings',
  );
  const dev = ws(it ? 'Sviluppo' : 'Development', '#4F7F5B');
  const personal = ws(it ? 'Personale' : 'Personal', '#B0553A');
  ws(it ? 'Accademia' : 'Academy', '#7A4B8C');

  const specialhub = add(work, 'project', 'SpecialHub', {
    description: it ? 'Piattaforma processi' : 'Process platform',
  });
  state.edges.push({ parent: dev.id, child: specialhub.id, sortOrder: 1000, pinned: false });
  const backend = add(specialhub, 'subproject', 'Backend');
  add(specialhub, 'subproject', 'Frontend');
  add(specialhub, 'subproject', 'Camunda');
  add(specialhub, 'subproject', it ? 'Documentazione' : 'Documentation');
  add(backend, 'path', 'specialhub-backend', { path: 'C:\\dev\\specialhub\\backend' });
  const devSection = add(backend, 'section', 'DEV');
  add(devSection, 'link_group', 'SpecialHub DEV');
  const prod = add(backend, 'section', 'PROD');
  (prod as Node).caution = 'confirm';
  add(prod, 'link_group', 'SpecialHub PROD');
  add(prod, 'section', 'Database');
  add(work, 'project', 'Meeting');
  const client = add(work, 'project', 'Cliente Rossi');
  (client as Node).isProtected = true;
  add(work, 'project', 'Onboarding');
  add(work, 'link', 'Outlook', { url: 'https://outlook.office.com' });
  add(personal, 'project', 'Casa');
  add(personal, 'project', 'Finanze');
}

seed();

/* --------------------------------------------------------------- comandi */

type Handlers = { [K in CommandName]: (args: CommandArgs<K>) => CommandResult<K> };

const handlers: Handlers = {
  bootstrap: () => ({
    isFirstRun: state.firstRun,
    appVersion: '0.1.0-preview',
    dbPath: '(anteprima nel browser — nessun database)',
    systemLocale: navigator.language,
    profiles: state.profiles,
    activeProfileId: state.settings.activeProfileId,
    settings: effectiveSettings(state.settings.activeProfileId),
    profileOverrides: [
      ...(state.overrides.get(state.settings.activeProfileId ?? '')?.keys() ?? []),
    ],
    windowMaterial: 'solid',
  }),
  complete_onboarding: () => {
    state.firstRun = false;
    return null;
  },
  set_setting: ({ key, value }) => {
    state.settings = { ...state.settings, [key]: JSON.parse(value) };
    return effectiveSettings(state.settings.activeProfileId);
  },
  set_profile_setting: ({ profileId, key, value }) => {
    const map = state.overrides.get(profileId) ?? new Map();
    if (value === null) map.delete(key);
    else map.set(key, JSON.parse(value));
    state.overrides.set(profileId, map);
    return effectiveSettings(profileId);
  },
  get_profile_overrides: ({ profileId }) => [...(state.overrides.get(profileId)?.keys() ?? [])],
  profile_scoped_keys: () => ['theme', 'language', 'density', 'openDelayMs'],
  activate_profile: ({ profileId }) => session(profileId),
  list_profiles: () => state.profiles,
  create_profile: ({ name }) => {
    const profile: Profile = {
      ...(state.profiles[0] as Profile),
      id: newId(),
      name: name.trim(),
      sortOrder: state.profiles.length * 1000 + 1000,
    };
    state.profiles.push(profile);
    return profile;
  },
  update_profile: ({ id, patch }) => {
    const profile = state.profiles.find((entry) => entry.id === id);
    if (!profile) throw new Error('profilo non trovato');
    if (patch.name) profile.name = patch.name.trim();
    if (patch.colorMain !== undefined) profile.colorMain = patch.colorMain;
    return profile;
  },
  profile_delete_impact: () => ({ workspacesDeleted: [], workspacesKept: 0, nodesDeleted: 0 }),
  delete_profile: ({ id }) => {
    if (state.profiles.length <= 1) throw new Error("l'ultimo profilo non si puo' eliminare");
    state.profiles = state.profiles.filter((entry) => entry.id !== id);
    return session((state.profiles[0] as Profile).id);
  },
  get_shortcut_status: ({ kind }) => ({
    accelerator:
      kind === 'palette' ? state.settings.globalShortcut : state.settings.captureShortcut,
    registered: false,
    error: "non disponibile nell'anteprima nel browser",
  }),
  apply_global_shortcut: ({ accelerator }) => ({
    accelerator,
    registered: false,
    error: "non disponibile nell'anteprima nel browser",
  }),

  list_workspaces: ({ profileId, includeArchived }) =>
    workspaceEntries(profileId, includeArchived ?? false),
  workspace_profiles: ({ workspaceId }) =>
    state.visibility.filter((v) => v.workspaceId === workspaceId).map((v) => v.profileId),
  set_workspace_visibility: ({ profileId, workspaceId, visible }) => {
    const present = state.visibility.some(
      (v) => v.profileId === profileId && v.workspaceId === workspaceId,
    );
    if (visible && !present) showWorkspace(profileId, workspaceId);
    if (!visible && present) {
      state.visibility = state.visibility.filter(
        (v) => !(v.profileId === profileId && v.workspaceId === workspaceId),
      );
      promoteDefaults();
    }
    return null;
  },
  reorder_workspace: () => null,
  set_default_workspace: ({ profileId, workspaceId }) => {
    for (const v of state.visibility) {
      if (v.profileId === profileId) v.isDefault = v.workspaceId === workspaceId;
    }
    return null;
  },
  remember_workspace_route: ({ profileId, workspaceId, route }) => {
    const v = state.visibility.find(
      (entry) => entry.profileId === profileId && entry.workspaceId === workspaceId,
    );
    if (v) {
      v.lastRoute = route;
      v.lastOpenedAt = now();
    }
    return null;
  },

  get_node_view: ({ profileId, id, viaWorkspaceId, includeArchived }) => {
    const node = get(id);
    const nearestCaution = [{ node, depth: 0 }, ...ancestors(id)].filter(
      (entry) => entry.node.caution,
    );
    const cautionSource = nearestCaution.sort(
      (a, b) =>
        a.depth - b.depth ||
        SEVERITY[b.node.caution as Caution] - SEVERITY[a.node.caution as Caution],
    )[0];
    const protectedSource = ancestors(id).find((entry) => entry.node.isProtected);
    return {
      node,
      breadcrumb: breadcrumb(profileId, id, viaWorkspaceId),
      workspaces: workspacesOf(id).map(crumb),
      children: childrenOf(id, includeArchived ?? false),
      protection: {
        isProtected: node.isProtected || !!protectedSource,
        isOwn: node.isProtected,
        inheritedFrom: !node.isProtected && protectedSource ? crumb(protectedSource.node) : null,
      },
      caution: {
        level: cautionSource?.node.caution ?? 'none',
        isOwn: cautionSource?.depth === 0,
        inheritedFrom: cautionSource && cautionSource.depth > 0 ? crumb(cautionSource.node) : null,
      },
      tags: [],
      isFavorite: state.favorites.some((f) => f.profileId === profileId && f.nodeId === id),
    };
  },
  list_children: ({ id, includeArchived }) => childrenOf(id, includeArchived ?? false),
  create_node: ({ profileId, parentId, input }) => create(profileId, parentId, input),
  update_node: ({ id, patch }) => {
    const node = get(id) as Node;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      (node as unknown as Record<string, unknown>)[key] = value;
    }
    node.updatedAt = now();
    return node;
  },
  move_node: () => null,
  share_node: ({ id, parentId }) => {
    attach(parentId, id);
    return null;
  },
  unshare_node: ({ id, parentId }) => {
    if (parentsOf(id).length <= 1) throw new Error("e' l'unico contenitore di questo elemento");
    state.edges = state.edges.filter((edge) => !(edge.parent === parentId && edge.child === id));
    return null;
  },
  set_node_pinned: ({ parentId, childId, pinned }) => {
    const edge = state.edges.find((e) => e.parent === parentId && e.child === childId);
    if (edge) edge.pinned = pinned;
    return null;
  },
  archive_node: ({ id, archived }) => {
    const node = get(id);
    node.archivedAt = archived ? now() : null;
    return node;
  },
  node_delete_impact: ({ id }) => {
    const set = deletionSet(id);
    const counts = new Map<NodeKind, number>();
    for (const member of set) {
      const kind = (state.nodes.get(member) as Node).kind;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
    return {
      deleted: [...counts].map(([kind, count]) => ({ kind, count })),
      detached: [],
    };
  },
  delete_node: ({ id }) => {
    const deletion = newId();
    for (const member of deletionSet(id)) {
      const node = state.nodes.get(member);
      if (node) node.deletion = deletion;
    }
    for (const v of state.visibility) if (v.workspaceId === id) v.isDefault = false;
    promoteDefaults();
    return deletion;
  },
  restore_deletion: ({ deletionId }) => {
    for (const node of state.nodes.values()) if (node.deletion === deletionId) node.deletion = null;
    promoteDefaults();
    return null;
  },
  duplicate_node: ({ profileId, id, parentId, name }) => {
    const original = get(id);
    const parent = parentId ?? parentsOf(id)[0]?.id ?? null;
    return create(profileId, parent, {
      kind: original.kind,
      name: name ?? original.name,
      url: original.url ?? undefined,
      path: original.path ?? undefined,
    });
  },
  set_node_tags: () => [],
  list_tags: () => [],

  toggle_favorite: ({ profileId, nodeId }) => {
    const index = state.favorites.findIndex(
      (f) => f.profileId === profileId && f.nodeId === nodeId,
    );
    if (index >= 0) {
      state.favorites.splice(index, 1);
      return false;
    }
    state.favorites.push({ profileId, nodeId });
    return true;
  },
  list_favorites: ({ profileId }) =>
    state.favorites
      .filter((f) => f.profileId === profileId && alive(f.nodeId))
      .map((f, index) => ({
        node: get(f.nodeId),
        actionId: null,
        toolId: null,
        sortOrder: index * 1000,
        workspaceIds: workspacesOf(f.nodeId).map((workspace) => workspace.id),
      })),
  list_recents: () => [],
};

/** Latenza finta ma realistica: l'interfaccia deve reggere anche l'attesa. */
export async function mockCall<K extends CommandName>(
  command: K,
  args: CommandArgs<K>,
): Promise<CommandResult<K>> {
  await new Promise((resolve) => setTimeout(resolve, 40));
  const handler = handlers[command] as (input: CommandArgs<K>) => CommandResult<K>;
  // Copia strutturata: come con Tauri, chi riceve non tocca lo stato interno.
  return structuredClone(handler(args));
}
