import type { CommandArgs, CommandName, CommandResult } from '@/lib/ipc';
import type { AppSettings } from '@/types/generated/AppSettings';
import type { Caution } from '@/types/generated/Caution';
import type { Crumb } from '@/types/generated/Crumb';
import type { NewNode } from '@/types/generated/NewNode';
import type { Node } from '@/types/generated/Node';
import type { NodeEntry } from '@/types/generated/NodeEntry';
import type { NodeKind } from '@/types/generated/NodeKind';
import type { Profile } from '@/types/generated/Profile';
import type { Tool } from '@/types/generated/Tool';
import type { ToolKind } from '@/types/generated/ToolKind';
import type { WorkspaceEntry } from '@/types/generated/WorkspaceEntry';

/* ============================================================================
   Backend simulato per l'anteprima nel browser (`npm run dev:vite`).

   Non entra mai nell'app vera: `ipc.ts` lo importa solo fuori da Tauri. Imita
   le regole principali di Rust quanto basta per disegnare e navigare
   l'interfaccia; la verita' resta nei test di `cargo test`.

   Parte con dati d'esempio (l'esempio SpecialHub del documento di
   riprogettazione). Nell'indirizzo: `?vuoto` parte da un database vuoto, come
   al primo avvio reale; `?tema=scuro` o `?tema=chiaro` forza il tema;
   `?lingua=en` o `?lingua=it` forza la lingua (utile per le schermate).
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
  tags: new Map<string, string[]>(),
  tools: [] as Tool[],
  /** `<profilo o nodo>:<tipo>` → strumento. */
  toolPreferences: new Map<string, string>(),
  usage: [] as {
    profileId: string;
    nodeId: string;
    actionId: string;
    toolId: string | null;
    via: string | null;
    at: string;
  }[],
};

state.tools = (
  [
    [
      'terminal:wt',
      'terminal',
      'Windows Terminal',
      String.raw`%LOCALAPPDATA%\Microsoft\WindowsApps\wt.exe`,
    ],
    [
      'terminal:pwsh',
      'terminal',
      'PowerShell 7',
      String.raw`C:\Program Files\PowerShell\7\pwsh.exe`,
    ],
    ['terminal:cmd', 'terminal', 'Command Prompt', String.raw`C:\Windows\System32\cmd.exe`],
    [
      'ide:vscode',
      'ide',
      'Visual Studio Code',
      String.raw`%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe`,
    ],
    [
      'ide:intellij',
      'ide',
      'IntelliJ IDEA',
      String.raw`C:\Program Files\JetBrains\IntelliJ IDEA\bin\idea64.exe`,
    ],
    ['ide:cursor', 'ide', 'Cursor', String.raw`%LOCALAPPDATA%\Programs\cursor\Cursor.exe`],
    [
      'browser:chrome',
      'browser',
      'Google Chrome',
      String.raw`C:\Program Files\Google\Chrome\Application\chrome.exe`,
    ],
    [
      'browser:edge',
      'browser',
      'Microsoft Edge',
      String.raw`C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`,
    ],
    [
      'browser:firefox',
      'browser',
      'Mozilla Firefox',
      String.raw`C:\Program Files\Mozilla Firefox\firefox.exe`,
    ],
  ] as const
).map(([id, kind, name, exePath]) => ({
  id,
  kind,
  name,
  exePath,
  source: 'detected',
  isHidden: false,
  available: true,
}));

const BROWSER_PROFILES: Record<string, { id: string; name: string }[]> = {
  'browser:chrome': [
    { id: 'Default', name: 'Personale' },
    { id: 'Profile 1', name: 'Lavoro' },
  ],
  'browser:edge': [{ id: 'Default', name: 'Profilo 1' }],
  'browser:firefox': [{ id: 'default-release', name: 'default-release' }],
};

const BLOCKED_EXTENSIONS =
  /\.(exe|com|bat|cmd|ps1|psm1|vbs|vbe|js|jse|wsf|wsh|msi|msp|scr|lnk|pif|cpl|hta|reg|jar)$/i;

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

/* Protezione: nell'anteprima la password e' in chiaro (in Rust e' Argon2id). */
const lock = {
  passwords: new Map<string, string>(),
  unlocked: new Set<string>(),
  failures: new Map<string, number>(),
};

function isProtectedDeep(id: string) {
  return get(id).isProtected || ancestors(id).some((entry) => entry.node.isProtected);
}

function hidden(profileId: string | null, id: string) {
  return !lock.unlocked.has(profileId ?? '') && isProtectedDeep(id);
}

function ensure(profileId: string | null, id: string) {
  if (hidden(profileId, id)) throw new Error('locked');
}

function redacted<T extends Node>(node: T): T {
  return { ...node, url: null, path: null, description: null, aliases: null };
}

function visibleChildren(profileId: string | null, id: string, includeArchived = false) {
  if (hidden(profileId, id)) return [];
  return childrenOf(id, includeArchived).map((entry) =>
    hidden(profileId, entry.node.id)
      ? { ...entry, node: redacted({ ...entry.node, isProtected: true }), childCount: 0 }
      : entry,
  );
}

const active = () => state.settings.activeProfileId;

const mockBackups = [
  {
    path: String.raw`C:\Users\me\AppData\Roaming\com.llamadesk.app\backups\llamadesk-auto-20260915-081204.db`,
    fileName: 'llamadesk-auto-20260915-081204.db',
    modifiedAt: Date.now() / 1000 - 3600 * 9,
    sizeBytes: 408_000,
    automatic: true,
  },
];

/* Avvio: passi per contenitore. */
const launch: {
  id: string;
  ownerId: string;
  targetId: string;
  actionId: string;
  toolId: string | null;
  sortOrder: number;
}[] = [];

function launchSteps(ownerId: string) {
  return launch
    .filter((step) => step.ownerId === ownerId && alive(step.targetId))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((step) => ({
      id: step.id,
      target: get(step.targetId),
      actionId: step.actionId,
      toolId: step.toolId,
      toolName: state.tools.find((tool) => tool.id === step.toolId)?.name ?? null,
      sortOrder: step.sortOrder,
    }));
}

/** Conferma effettiva: la piu' vicina, a parita' di distanza la piu' severa. */
function resolvedCaution(id: string) {
  const node = get(id);
  const source = [{ node, depth: 0 }, ...ancestors(id)]
    .filter((entry) => entry.node.caution)
    .sort(
      (a, b) =>
        a.depth - b.depth ||
        SEVERITY[b.node.caution as Caution] - SEVERITY[a.node.caution as Caution],
    )[0];
  return {
    level: (source?.node.caution ?? 'none') as Caution,
    isOwn: source?.depth === 0,
    inheritedFrom: source && source.depth > 0 ? crumb(source.node) : null,
  };
}

/** Preferenza piu' vicina lungo il contesto, poi il profilo, poi il primo disponibile. */
function effectiveTool(
  profileId: string,
  nodeId: string | null,
  via: string | null,
  kind: ToolKind,
): Tool | null {
  const chain = nodeId ? breadcrumb(profileId, nodeId, via).reverse() : [];
  const visible = state.tools.filter((tool) => tool.kind === kind && !tool.isHidden);
  for (const owner of [...chain.map((entry) => entry.id), profileId]) {
    const id = state.toolPreferences.get(`${owner}:${kind}`);
    const tool = visible.find((candidate) => candidate.id === id);
    if (tool) return tool;
  }
  return visible[0] ?? null;
}

function planAction(args: CommandArgs<'prepare_action'>) {
  const node = get(args.nodeId);
  const kinds: Record<string, ToolKind | null> = {
    open_with: node.kind === 'path' ? 'ide' : 'browser',
    terminal: 'terminal',
  };
  const allowed: Record<NodeKind, string[]> = {
    link: ['open', 'open_with'],
    link_group: ['open', 'open_with'],
    path: ['open', 'open_with', 'terminal', 'reveal', 'open_remote'],
    workspace: [],
    project: [],
    subproject: [],
    section: [],
  };
  if (!allowed[node.kind].includes(args.actionId)) {
    throw new Error(`l'azione '${args.actionId}' non vale per un elemento di tipo ${node.kind}`);
  }
  if (node.kind === 'path' && node.path?.toLowerCase().includes('postman')) {
    throw new Error(`percorso non trovato: ${node.path}`);
  }
  if (
    node.kind === 'path' &&
    args.actionId === 'open' &&
    BLOCKED_EXTENSIONS.test(node.path ?? '')
  ) {
    throw new Error(
      'per sicurezza LlamaDesk non avvia programmi e script: usa Mostra in Esplora risorse',
    );
  }

  const links =
    node.kind === 'link_group'
      ? childrenOf(node.id).filter((entry) => entry.node.kind === 'link' && entry.node.enabled)
      : [];
  if (node.kind === 'link_group' && links.length === 0) {
    throw new Error('il gruppo non ha link attivi');
  }

  const toolKind =
    kinds[args.actionId] ??
    (node.kind !== 'path' && (node.browserToolId || node.openMode === 'new_window')
      ? 'browser'
      : null);
  const tool = !toolKind
    ? null
    : args.toolId
      ? (state.tools.find((candidate) => candidate.id === args.toolId) ?? null)
      : node.browserToolId && args.actionId === 'open'
        ? (state.tools.find((candidate) => candidate.id === node.browserToolId) ?? null)
        : effectiveTool(args.profileId, node.id, args.viaWorkspaceId, toolKind);
  if (toolKind && !tool) throw new Error('nessuno strumento trovato');

  const levels = [node.id, ...links.map((entry) => entry.node.id)].map(
    (id) => resolvedCaution(id).level,
  );
  const caution =
    args.actionId === 'reveal'
      ? 'none'
      : levels.reduce<Caution>(
          (max, level) => (SEVERITY[level] > SEVERITY[max] ? level : max),
          'none',
        );

  const profile =
    tool && node.browserProfile && (!node.browserToolId || node.browserToolId === tool.id)
      ? (BROWSER_PROFILES[tool.id]?.find((entry) => entry.id === node.browserProfile)?.name ?? null)
      : null;

  return {
    actionId: args.actionId,
    nodeName: node.name,
    caution,
    count: node.kind === 'link_group' ? links.length : 1,
    tool,
    browserProfile: profile,
  };
}

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
  // Parametri dell'anteprima: lingua e tema prima di creare qualsiasi cosa.
  const query = new URLSearchParams(window.location.search);
  const language = query.get('lingua');
  if (language === 'en' || language === 'it') state.settings.language = language;
  if (query.get('tema') === 'scuro') state.settings.theme = 'dark';
  if (query.get('tema') === 'chiaro') state.settings.theme = 'light';

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
  const repo = add(backend, 'path', 'specialhub-backend', { path: 'C:\\dev\\specialhub\\backend' });
  const devSection = add(backend, 'section', 'DEV');
  const devGroup = add(devSection, 'link_group', 'SpecialHub DEV');
  const prod = add(backend, 'section', 'PROD');
  (prod as Node).caution = 'confirm';
  const prodGroup = add(prod, 'link_group', 'SpecialHub PROD');
  add(prod, 'section', 'Database');
  add(work, 'project', 'Meeting');
  const client = add(work, 'project', 'Cliente Rossi');
  (client as Node).isProtected = true;
  // Password dell'anteprima, per provare lo sblocco: "llama".
  lock.passwords.set(profile.id, 'llama');
  add(work, 'project', 'Onboarding');
  add(work, 'link', 'Outlook', { url: 'https://outlook.office.com' });
  add(personal, 'project', 'Casa');
  add(personal, 'project', 'Finanze');

  // Aggiunti in coda per non spostare gli id dei nodi qui sopra.
  for (const [name, url] of [
    ['GitHub', 'https://github.com/specialhub/backend'],
    ['Jira', 'https://specialhub.atlassian.net/jira'],
    ['Camunda Operate', 'https://operate.dev.specialhub.it'],
    ['Grafana', 'https://grafana.dev.specialhub.it'],
    ['API docs', 'https://api.dev.specialhub.it/docs'],
    ['Confluence', 'https://specialhub.atlassian.net/wiki'],
  ] as const) {
    add(devGroup, 'link', name, { url });
  }
  for (const [name, url] of [
    ['Camunda Operate', 'https://operate.specialhub.it'],
    ['Grafana', 'https://grafana.specialhub.it'],
    ['Kibana', 'https://kibana.specialhub.it'],
  ] as const) {
    add(prodGroup, 'link', name, { url });
  }
  add(backend, 'path', 'BPMN condivisi', { path: String.raw`\\nas\processi\specialhub` });
  const docs = add(backend, 'section', it ? 'Documentazione' : 'Documentation');
  add(docs, 'link', 'Confluence · Backend', {
    url: 'https://specialhub.atlassian.net/wiki/backend',
  });
  add(docs, 'path', 'Architettura v3.pdf', {
    path: String.raw`C:\Users\me\Documents\SpecialHub\Architettura v3.pdf`,
  });
  add(docs, 'path', 'Postman collection', { path: String.raw`C:\dev\specialhub\postman` });

  // Qualche uso recente, perche' "Continua" e Recenti abbiano qualcosa da mostrare.
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
  state.usage.push(
    {
      profileId: p,
      nodeId: repo.id,
      actionId: 'open_with',
      toolId: 'ide:intellij',
      via: work.id,
      at: ago(2880),
    },
    {
      profileId: p,
      nodeId: devGroup.id,
      actionId: 'open',
      toolId: null,
      via: work.id,
      at: ago(95),
    },
    {
      profileId: p,
      nodeId: repo.id,
      actionId: 'terminal',
      toolId: null,
      via: work.id,
      at: ago(18),
    },
  );

  // Avvio del Backend: IDE sul repository, poi il gruppo DEV.
  launch.push(
    {
      id: 'launch-1',
      ownerId: backend.id,
      targetId: repo.id,
      actionId: 'open_with',
      toolId: 'ide:intellij',
      sortOrder: 1000,
    },
    {
      id: 'launch-2',
      ownerId: backend.id,
      targetId: devGroup.id,
      actionId: 'open',
      toolId: null,
      sortOrder: 2000,
    },
  );
}

seed();

/* --------------------------------------------------------------- comandi */

type Handlers = { [K in CommandName]: (args: CommandArgs<K>) => CommandResult<K> };

const handlers: Handlers = {
  bootstrap: () => ({
    isFirstRun: state.firstRun,
    appVersion: '0.0.1-preview',
    dbPath: '(anteprima nel browser — nessun database)',
    // Nell'anteprima la lingua di sistema segue `?lingua`, se c'e'.
    systemLocale: state.settings.language,
    profiles: state.profiles,
    activeProfileId: state.settings.activeProfileId,
    settings: effectiveSettings(state.settings.activeProfileId),
    profileOverrides: [
      ...(state.overrides.get(state.settings.activeProfileId ?? '')?.keys() ?? []),
    ],
    windowMaterial: 'solid',
    startedHidden: false,
  }),
  window_ready: () => null,
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
  activate_profile: ({ profileId }) => {
    lock.unlocked.clear();
    return session(profileId);
  },
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
    if (patch.lockAutoMinutes !== undefined) profile.lockAutoMinutes = patch.lockAutoMinutes;
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
    const protectedSource = ancestors(id).find((entry) => entry.node.isProtected);
    const locked = hidden(profileId, id);
    return {
      node: locked ? redacted(node) : node,
      locked,
      breadcrumb: breadcrumb(profileId, id, viaWorkspaceId),
      workspaces: workspacesOf(id).map(crumb),
      children: visibleChildren(profileId, id, includeArchived ?? false),
      protection: {
        isProtected: node.isProtected || !!protectedSource,
        isOwn: node.isProtected,
        inheritedFrom: !node.isProtected && protectedSource ? crumb(protectedSource.node) : null,
      },
      caution: resolvedCaution(id),
      tags: (locked ? [] : (state.tags.get(id) ?? [])).map((name) => ({
        id: name.toLowerCase(),
        name,
        color: null,
      })),
      isFavorite: state.favorites.some((f) => f.profileId === profileId && f.nodeId === id),
    };
  },
  list_children: ({ id, includeArchived }) =>
    visibleChildren(active(), id, includeArchived ?? false),
  create_node: ({ profileId, parentId, input }) => create(profileId, parentId, input),
  update_node: ({ id, patch }) => {
    ensure(active(), id);
    if (patch.isProtected && !lock.passwords.has(active() ?? '')) throw new Error('no_lock');
    const node = get(id) as Node;
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      (node as unknown as Record<string, unknown>)[key] = value;
    }
    node.updatedAt = now();
    return node;
  },
  move_node: ({ id, fromParentId, toParentId, previousId, nextId }) => {
    const from = fromParentId ?? parentsOf(id)[0]?.id;
    const edge = state.edges.find((e) => e.parent === from && e.child === id);
    if (!edge) throw new Error("l'elemento non si trova nel contenitore di partenza");
    const target = get(toParentId);
    if (!RULES[target.kind].includes(get(id).kind)) {
      throw new Error(`${get(id).kind} non puo' stare dentro ${target.kind}`);
    }
    const order = (sibling: string | null) =>
      state.edges.find((e) => e.parent === toParentId && e.child === sibling)?.sortOrder ?? null;
    const before = order(previousId);
    const after = order(nextId);
    const last = Math.max(
      0,
      ...state.edges.filter((e) => e.parent === toParentId).map((e) => e.sortOrder),
    );
    edge.parent = toParentId;
    edge.sortOrder =
      before !== null && after !== null
        ? (before + after) / 2
        : before !== null
          ? before + 1000
          : after !== null
            ? after - 1000
            : last + 1000;
    return null;
  },
  create_link_group: ({ profileId, parentId, name, links }) => {
    const group = create(profileId, parentId, { kind: 'link_group', name });
    for (const link of links) create(profileId, group.id, link);
    return group;
  },
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
  set_node_tags: ({ id, names }) => {
    const clean = [...new Set(names.map((name) => name.trim().replace(/^#/, '')).filter(Boolean))];
    state.tags.set(id, clean);
    return clean.map((name) => ({ id: name.toLowerCase(), name, color: null }));
  },
  list_tags: () =>
    [...new Set([...state.tags.values()].flat())].map((name) => ({
      id: name.toLowerCase(),
      name,
      color: null,
    })),

  toggle_favorite: ({ profileId, nodeId }) => {
    ensure(profileId, nodeId);
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
      .filter((f) => f.profileId === profileId && alive(f.nodeId) && !hidden(profileId, f.nodeId))
      .map((f, index) => ({
        node: get(f.nodeId),
        actionId: null,
        toolId: null,
        sortOrder: index * 1000,
        workspaceIds: workspacesOf(f.nodeId).map((workspace) => workspace.id),
      })),
  list_recents: ({ profileId, workspaceId, limit }) => {
    const groups = new Map<string, (typeof state.usage)[number] & { count: number }>();
    for (const event of state.usage) {
      if (event.profileId !== profileId || !alive(event.nodeId)) continue;
      if (hidden(profileId, event.nodeId)) continue;
      if (
        workspaceId &&
        event.via !== workspaceId &&
        !workspacesOf(event.nodeId).some((workspace) => workspace.id === workspaceId)
      ) {
        continue;
      }
      const key = `${event.nodeId}|${event.actionId}|${event.toolId ?? ''}`;
      const known = groups.get(key);
      groups.set(key, { ...event, count: (known?.count ?? 0) + 1 });
    }
    return [...groups.values()]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, limit ?? 12)
      .map((event) => ({
        node: get(event.nodeId),
        actionId: event.actionId,
        toolId: event.toolId,
        viaWorkspaceId: event.via,
        lastAt: event.at.slice(0, 19).replace('T', ' '),
        count: event.count,
      }));
  },

  list_tools: ({ includeHidden }) => state.tools.filter((tool) => includeHidden || !tool.isHidden),
  refresh_tools: () => state.tools,
  browser_profiles: ({ toolId }) => BROWSER_PROFILES[toolId] ?? [],
  add_custom_tool: ({ kind, name, exePath }) => {
    if (!name.trim()) throw new Error('dai un nome allo strumento');
    if (!/\.(exe|cmd|bat)$/i.test(exePath.trim())) {
      throw new Error(`eseguibile non trovato: ${exePath}`);
    }
    const tool: Tool = {
      id: `custom:${newId()}`,
      kind,
      name: name.trim(),
      exePath: exePath.trim(),
      source: 'custom',
      isHidden: false,
      available: true,
    };
    state.tools.push(tool);
    return tool;
  },
  delete_custom_tool: ({ toolId }) => {
    state.tools = state.tools.filter((tool) => !(tool.id === toolId && tool.source === 'custom'));
    return null;
  },
  set_tool_hidden: ({ toolId, hidden }) => {
    const tool = state.tools.find((candidate) => candidate.id === toolId);
    if (tool) tool.isHidden = hidden;
    return null;
  },
  set_tool_preference: ({ profileId, nodeId, kind, toolId }) => {
    const key = `${nodeId ?? profileId}:${kind}`;
    if (toolId) state.toolPreferences.set(key, toolId);
    else state.toolPreferences.delete(key);
    return null;
  },
  tool_preferences: ({ profileId, nodeId, viaWorkspaceId }) =>
    (['ide', 'terminal', 'browser'] as const).map((kind) => ({
      kind,
      own: state.toolPreferences.get(`${nodeId ?? profileId}:${kind}`) ?? null,
      effective: effectiveTool(profileId, nodeId, viaWorkspaceId, kind)?.id ?? null,
    })),
  prepare_action: (args) => {
    ensure(args.profileId, args.nodeId);
    return planAction(args);
  },
  execute_action: ({ confirmation, ...args }) => {
    ensure(args.profileId, args.nodeId);
    const plan = planAction(args);
    const confirmed =
      plan.caution === 'none' ||
      (plan.caution === 'confirm' && confirmation !== null) ||
      (plan.caution === 'type_name' &&
        confirmation?.trim().toLowerCase() === plan.nodeName.trim().toLowerCase());
    if (!confirmed) throw new Error('confirmation_required');
    state.usage.push({
      profileId: args.profileId,
      nodeId: args.nodeId,
      actionId: args.actionId,
      toolId: args.toolId,
      via: args.viaWorkspaceId ?? workspacesOf(args.nodeId)[0]?.id ?? null,
      at: new Date().toISOString(),
    });
    return {
      opened: plan.count,
      toolName: plan.tool?.name ?? null,
      browserProfile: plan.browserProfile,
    };
  },

  // Imitazione semplice della ricerca di Rust: parole nel nome, negli antenati
  // o nell'indirizzo; un verbo ("term", nome di uno strumento) propone l'azione.
  search_library: ({ profileId, text, workspaceId, contextId, limit }) => {
    const raw = text.trim();
    if (!raw || raw.startsWith('>')) return [];
    const containersOnly = raw.startsWith('@');
    const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
    let words = fold(raw.replace(/^@/, '')).split(/\s+/).filter(Boolean);
    const isContainer = (kind: NodeKind) =>
      ['workspace', 'project', 'subproject', 'section'].includes(kind);

    const verbOf = (word: string) => {
      if (word.length >= 3 && 'terminale'.startsWith(word))
        return { actionId: 'terminal', tool: null };
      const tool = state.tools.find(
        (candidate) => word.length >= 3 && (candidate.id.split(':')[1] ?? '').startsWith(word),
      );
      if (!tool) return null;
      return { actionId: tool.kind === 'terminal' ? 'terminal' : 'open_with', tool };
    };
    const last = words.at(-1) ?? '';
    const verb = containersOnly ? null : verbOf(last);
    if (verb) words = words.slice(0, -1);

    const visible = new Set(
      state.visibility.filter((v) => v.profileId === profileId).map((v) => v.workspaceId),
    );
    const firstPath = (id: string): Node | null => {
      for (const entry of childrenOf(id)) if (entry.node.kind === 'path') return entry.node;
      for (const entry of childrenOf(id)) {
        if (!isContainer(entry.node.kind)) continue;
        const found = firstPath(entry.node.id);
        if (found) return found;
      }
      return null;
    };

    const hits = [];
    for (const node of state.nodes.values()) {
      if (node.deletion || node.archivedAt) continue;
      if (containersOnly && !isContainer(node.kind)) continue;
      if (hidden(profileId, node.id)) continue;
      const workspaces = workspacesOf(node.id).filter((workspace) => visible.has(workspace.id));
      if (workspaces.length === 0) continue;
      const via =
        workspaces.find((workspace) => workspace.id === workspaceId)?.id ??
        (workspaces[0] as Node).id;
      const trail = breadcrumb(profileId, node.id, via);
      const name = fold(node.name);
      const others = fold(
        [
          ...trail.slice(0, -1).map((crumb) => crumb.name),
          node.url ?? '',
          node.path ?? '',
          node.aliases ?? '',
        ].join(' '),
      );

      let score = 0;
      const highlights: [number, number][] = [];
      let matchedAll = true;
      for (const word of words) {
        const at = name.indexOf(word);
        if (at >= 0) {
          score += at === 0 ? 100 : 80;
          highlights.push([at, at + word.length]);
        } else if (others.includes(word)) {
          score += 50;
        } else {
          matchedAll = false;
          break;
        }
      }
      if (!matchedAll) continue;

      let action = null;
      if (verb) {
        const browser = verb.tool?.kind === 'browser';
        const fits = ['link', 'link_group'].includes(node.kind) ? browser : !browser;
        if (!fits) continue;
        if (words.length === 0) {
          if (isContainer(node.kind)) continue;
          const inContext = trail.some((crumb) => crumb.id === contextId);
          score = 40 + (inContext ? 35 : 0);
        }
        const target = isContainer(node.kind) ? firstPath(node.id) : node;
        if (!target) continue;
        action = {
          actionId: verb.actionId,
          toolId: verb.tool?.id ?? null,
          toolName: verb.tool?.name ?? null,
          target,
        };
      } else if (words.length === 0) {
        continue;
      }

      hits.push({
        node,
        breadcrumb: trail,
        workspaceId: via,
        score: score / Math.max(words.length, 1) + (via === workspaceId ? 5 : 0),
        highlights: highlights.sort((a, b) => a[0] - b[0]),
        matched: 'name',
        action,
      });
    }
    return hits
      .sort((a, b) => b.score - a.score || a.node.name.localeCompare(b.node.name))
      .slice(0, limit ?? 30);
  },

  list_launch_steps: ({ ownerId }) => launchSteps(ownerId),
  add_launch_step: ({ ownerId, targetId, actionId, toolId }) => {
    const descendants = new Set<string>();
    const walk = (id: string) =>
      childrenOf(id).forEach((entry) => {
        descendants.add(entry.node.id);
        walk(entry.node.id);
      });
    walk(ownerId);
    if (!descendants.has(targetId)) throw new Error("l'elemento non sta dentro il contenitore");
    const id = newId();
    const mine = launch.filter((step) => step.ownerId === ownerId);
    launch.push({
      id,
      ownerId,
      targetId,
      actionId,
      toolId,
      sortOrder: Math.max(0, ...mine.map((step) => step.sortOrder)) + 1000,
    });
    return launchSteps(ownerId).find((step) => step.id === id) as ReturnType<
      typeof launchSteps
    >[number];
  },
  remove_launch_step: ({ stepId }) => {
    const index = launch.findIndex((step) => step.id === stepId);
    if (index >= 0) launch.splice(index, 1);
    return null;
  },
  move_launch_step: ({ stepId, previousId, nextId }) => {
    const step = launch.find((candidate) => candidate.id === stepId);
    if (!step) throw new Error('passo non trovato');
    const order = (id: string | null) => launch.find((other) => other.id === id)?.sortOrder;
    const before = order(previousId);
    const after = order(nextId);
    step.sortOrder =
      before !== undefined && after !== undefined
        ? (before + after) / 2
        : before !== undefined
          ? before + 1000
          : after !== undefined
            ? after - 1000
            : step.sortOrder;
    return null;
  },
  prepare_launch: ({ profileId, ownerId, viaWorkspaceId }) => {
    const plans = launchSteps(ownerId).map((step) =>
      planAction({
        profileId,
        nodeId: step.target.id,
        actionId: step.actionId,
        toolId: step.toolId,
        viaWorkspaceId,
      }),
    );
    const levels = [resolvedCaution(ownerId).level, ...plans.map((plan) => plan.caution)];
    return {
      actionId: 'launch',
      nodeName: get(ownerId).name,
      caution: levels.reduce<Caution>(
        (max, level) => (SEVERITY[level] > SEVERITY[max] ? level : max),
        'none',
      ),
      count: plans.reduce((total, plan) => total + plan.count, 0),
      tool: null,
      browserProfile: null,
    };
  },
  run_launch: ({ profileId, ownerId, viaWorkspaceId, confirmation }) => {
    const steps = launchSteps(ownerId);
    if (steps.length === 0) throw new Error('nessun passo di Avvio');
    const plan = handlers.prepare_launch({ profileId, ownerId, viaWorkspaceId });
    const confirmed =
      plan.caution === 'none' ||
      (plan.caution === 'confirm' && confirmation !== null) ||
      (plan.caution === 'type_name' &&
        confirmation?.trim().toLowerCase() === plan.nodeName.trim().toLowerCase());
    if (!confirmed) throw new Error('confirmation_required');
    const failures = [];
    let opened = 0;
    for (const step of steps) {
      try {
        opened += planAction({
          profileId,
          nodeId: step.target.id,
          actionId: step.actionId,
          toolId: step.toolId,
          viaWorkspaceId,
        }).count;
      } catch (error) {
        failures.push({ stepName: step.target.name, error: String((error as Error).message) });
      }
    }
    state.usage.push({
      profileId,
      nodeId: ownerId,
      actionId: 'launch',
      toolId: null,
      via: viaWorkspaceId,
      at: new Date().toISOString(),
    });
    return { steps: steps.length, opened, failures };
  },

  set_node_cover: () => {
    throw new Error("le cover richiedono l'app installata");
  },
  asset_path: () => '',
  list_backups: () => mockBackups,
  create_backup: () => {
    const backup = {
      path: String.raw`C:\Users\me\AppData\Roaming\com.llamadesk.app\backups\llamadesk-anteprima.db`,
      fileName: 'llamadesk-anteprima.db',
      modifiedAt: Date.now() / 1000,
      sizeBytes: 412_000,
      automatic: false,
    };
    mockBackups.unshift(backup);
    return backup;
  },
  restore_backup: () => {
    throw new Error("il ripristino richiede l'app installata");
  },
  reveal_backups: () => null,

  lock_status: ({ profileId }) => {
    const failures = lock.failures.get(profileId) ?? 0;
    return {
      hasLock: lock.passwords.has(profileId),
      unlocked: lock.unlocked.has(profileId),
      protectedCount: [...state.nodes.values()].filter(
        (node) =>
          !node.deletion &&
          workspacesOf(node.id).some((workspace) =>
            state.visibility.some(
              (v) => v.profileId === profileId && v.workspaceId === workspace.id,
            ),
          ) &&
          isProtectedDeep(node.id),
      ).length,
      retryAfterSeconds: failures >= 3 ? 30 : 0,
      autoMinutes:
        state.profiles.find((profile) => profile.id === profileId)?.lockAutoMinutes ?? 10,
    };
  },
  unlock_profile: ({ profileId, password }) => {
    const ok = lock.passwords.get(profileId) === password;
    if (ok) {
      lock.unlocked.add(profileId);
      lock.failures.delete(profileId);
    } else {
      lock.failures.set(profileId, (lock.failures.get(profileId) ?? 0) + 1);
    }
    return { unlocked: ok, retryAfterSeconds: (lock.failures.get(profileId) ?? 0) >= 3 ? 30 : 0 };
  },
  set_lock_password: ({ profileId, current, password }) => {
    if (password.length < 4) throw new Error('la password deve avere almeno 4 caratteri');
    const known = lock.passwords.get(profileId);
    if (known !== undefined && known !== current) {
      throw new Error("la password attuale non e' corretta");
    }
    lock.passwords.set(profileId, password);
    lock.unlocked.add(profileId);
    return null;
  },
  remove_lock: ({ profileId }) => {
    let cleared = 0;
    for (const node of state.nodes.values()) {
      if (node.isProtected && !node.deletion) {
        node.isProtected = false;
        cleared += 1;
      }
    }
    lock.passwords.delete(profileId);
    lock.unlocked.delete(profileId);
    return cleared;
  },
  lock_session: () => {
    lock.unlocked.clear();
    return null;
  },
  touch_session: () => null,

  // Nessun disco nel browser: tipi plausibili, dedotti dal percorso.
  inspect_paths: ({ pathsToInspect }) =>
    pathsToInspect.map((path) => {
      const lower = path.toLowerCase();
      const extension = /\.([a-z0-9]+)$/.exec(lower)?.[1] ?? null;
      const kind = lower.includes('postman')
        ? 'missing'
        : extension
          ? 'file'
          : /backend|frontend/.test(lower)
            ? 'repository'
            : 'directory';
      return {
        path,
        resolved: path,
        kind,
        isNetwork: path.startsWith(String.raw`\\`),
        sizeBytes: kind === 'file' ? 2.4 * 1024 * 1024 : null,
        modifiedAt: kind === 'missing' ? null : Date.now() / 1000 - 86_400,
        extension: kind === 'file' ? extension : null,
        gitBranch: kind === 'repository' ? 'develop' : null,
      };
    }),
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
