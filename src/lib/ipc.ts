import { invoke } from '@tauri-apps/api/core';
import type {
  Application,
  ApplicationWithLinks,
  AppSettings,
  Background,
  BackgroundSource,
  BackupPreview,
  BootstrapPayload,
  Bundle,
  BundleWithLinks,
  BulkOpenPlan,
  Container,
  ContainerKind,
  ContainerView,
  DangerLevel,
  DangerPrompt,
  DeleteImpact,
  ImportMode,
  ImportSummary,
  Link,
  LinkKind,
  LinkUsage,
  NotableType,
  Note,
  OpenIntent,
  Profile,
  SearchHit,
  ShortcutStatus,
  Tag,
  TaggableType,
} from '@/types/domain';

/* ============================================================================
   UNICO punto di contatto fra React e Rust.
   Nessun componente chiama `invoke` direttamente: qui i comandi sono tipizzati,
   qui si centralizza la gestione degli errori, qui si potrà fare mocking nei test.
   ========================================================================== */

/** Errore risalito dal backend Rust, già leggibile dall'utente. */
export class IpcError extends Error {
  constructor(
    public readonly command: string,
    message: string,
  ) {
    super(message);
    this.name = 'IpcError';
  }
}

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    const message =
      typeof error === 'string' ? error : ((error as Error)?.message ?? String(error));
    throw new IpcError(command, message);
  }
}

/** True quando giriamo dentro Tauri (in `vite dev` puro non c'è backend). */
export const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** Campi modificabili di un contenitore. `dangerLevel: 'inherit'` torna a ereditare. */
export interface ContainerPatch {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  badgeText?: string;
  dangerLevel?: string;
  isFavorite?: boolean;
}

export interface ApplicationPatch {
  name?: string;
  description?: string;
  icon?: string;
  color?: string;
  dangerLevel?: string;
  isFavorite?: boolean;
}

export interface LinkPatch {
  name?: string;
  url?: string;
  kind?: LinkKind;
  description?: string;
  icon?: string;
  dangerLevel?: string;
  isFavorite?: boolean;
  isDefault?: boolean;
}

export const ipc = {
  /* --- Avvio ------------------------------------------------------------ */
  bootstrap: () => call<BootstrapPayload>('bootstrap'),
  completeOnboarding: () => call<void>('complete_onboarding'),

  /* --- Impostazioni ----------------------------------------------------- */
  getSettings: () => call<AppSettings>('get_settings'),
  setSetting: (key: keyof AppSettings, value: unknown) =>
    call<AppSettings>('set_setting', { key, value: JSON.stringify(value) }),

  /* --- Profili ---------------------------------------------------------- */
  listProfiles: () => call<Profile[]>('list_profiles'),
  createProfile: (name: string, icon?: string) => call<Profile>('create_profile', { name, icon }),
  renameProfile: (id: string, name: string) => call<Profile>('rename_profile', { id, name }),

  /* --- Gerarchia -------------------------------------------------------- */
  listContainers: (profileId: string) => call<Container[]>('list_containers', { profileId }),
  getContainerView: (id: string) => call<ContainerView>('get_container_view', { id }),
  resolveSiblingPath: (containerId: string, targetEnvironmentId: string) =>
    call<string>('resolve_sibling_path', { containerId, targetEnvironmentId }),
  createContainer: (
    profileId: string,
    parentId: string | null,
    kind: ContainerKind,
    name: string,
  ) => call<Container>('create_container', { profileId, parentId, kind, name }),
  updateContainer: (id: string, patch: ContainerPatch) =>
    call<Container>('update_container', { id, ...patch }),
  moveContainer: (
    id: string,
    newParentId: string | null,
    previousId: string | null,
    nextId: string | null,
  ) => call<Container>('move_container', { id, newParentId, previousId, nextId }),
  containerDeleteImpact: (id: string) => call<DeleteImpact>('container_delete_impact', { id }),
  deleteContainer: (id: string) => call<void>('delete_container', { id }),
  duplicateContainer: (id: string, newName: string) =>
    call<Container>('duplicate_container', { id, newName }),

  /* --- Applicazioni ----------------------------------------------------- */
  createApplication: (profileId: string, containerId: string, name: string) =>
    call<Application>('create_application', { profileId, containerId, name }),
  updateApplication: (id: string, patch: ApplicationPatch) =>
    call<Application>('update_application', { id, ...patch }),
  moveApplication: (
    id: string,
    containerId: string,
    previousId: string | null,
    nextId: string | null,
  ) => call<Application>('move_application', { id, containerId, previousId, nextId }),
  deleteApplication: (id: string) => call<void>('delete_application', { id }),
  duplicateApplication: (id: string, newName: string) =>
    call<Application>('duplicate_application', { id, newName }),

  /* --- Link ------------------------------------------------------------- */
  createLink: (applicationId: string, name: string, url: string, kind: LinkKind = 'web') =>
    call<Link>('create_link', { applicationId, name, url, kind }),
  updateLink: (id: string, patch: LinkPatch) => call<Link>('update_link', { id, ...patch }),
  moveLink: (id: string, applicationId: string, previousId: string | null, nextId: string | null) =>
    call<Link>('move_link', { id, applicationId, previousId, nextId }),
  deleteLink: (id: string) => call<void>('delete_link', { id }),

  /* --- Apertura e Danger Zone ------------------------------------------- */
  listDangerPrompts: () => call<DangerPrompt[]>('list_danger_prompts'),
  prepareOpen: (linkId: string) => call<OpenIntent>('prepare_open', { linkId }),
  prepareOpenMany: (linkIds: string[]) => call<BulkOpenPlan>('prepare_open_many', { linkIds }),
  openLink: (linkId: string, confirmed = false) => call<void>('open_link', { linkId, confirmed }),
  openLinks: (linkIds: string[], confirmed = false) =>
    call<number>('open_links', { linkIds, confirmed }),

  /* --- Ricerca, recenti, salute dei link -------------------------------- */
  search: (profileId: string, query: string) =>
    call<SearchHit[]>('search_all', { profileId, query }),
  linkHealth: (profileId: string) => call<LinkUsage[]>('link_health', { profileId }),
  recentApplications: (profileId: string, limit?: number) =>
    call<ApplicationWithLinks[]>('recent_applications', { profileId, limit }),
  favouriteApplications: (profileId: string) =>
    call<ApplicationWithLinks[]>('favourite_applications', { profileId }),

  /* --- Tag e note ------------------------------------------------------- */
  listTags: (profileId: string) => call<Tag[]>('list_tags', { profileId }),
  tagsForEntity: (entityType: TaggableType, entityId: string) =>
    call<Tag[]>('tags_for_entity', { entityType, entityId }),
  setEntityTags: (profileId: string, entityType: TaggableType, entityId: string, names: string[]) =>
    call<Tag[]>('set_entity_tags', { profileId, entityType, entityId, names }),
  getNote: (entityType: NotableType, entityId: string) =>
    call<Note | null>('get_note', { entityType, entityId }),
  setNote: (entityType: NotableType, entityId: string, content: string) =>
    call<Note | null>('set_note', { entityType, entityId, content }),

  /* --- Quick Workspaces ------------------------------------------------- */
  listBundles: (profileId: string) => call<BundleWithLinks[]>('list_bundles', { profileId }),
  createBundle: (profileId: string, name: string, expiresAt?: string) =>
    call<Bundle>('create_bundle', { profileId, name, expiresAt }),
  updateBundle: (id: string, patch: { name?: string; icon?: string; openDelayMs?: number }) =>
    call<Bundle>('update_bundle', { id, ...patch }),
  deleteBundle: (id: string) => call<void>('delete_bundle', { id }),
  addBundleLink: (bundleId: string, linkId: string) =>
    call<void>('add_bundle_link', { bundleId, linkId }),
  removeBundleLink: (bundleId: string, linkId: string) =>
    call<void>('remove_bundle_link', { bundleId, linkId }),
  reorderBundleLinks: (bundleId: string, linkIds: string[]) =>
    call<void>('reorder_bundle_links', { bundleId, linkIds }),

  /* --- Backup ----------------------------------------------------------- */
  exportBackup: (path: string) => call<number>('export_backup', { path }),
  previewBackup: (path: string) => call<BackupPreview>('preview_backup', { path }),
  importBackup: (path: string, mode: ImportMode) =>
    call<ImportSummary>('import_backup', { path, mode }),

  /* --- Sfondi ----------------------------------------------------------- */
  listBackgrounds: () => call<Background[]>('list_backgrounds'),
  createBackground: (name: string, source: BackgroundSource, value: string) =>
    call<Background>('create_background', { name, source, value }),
  importBackgroundImage: (sourcePath: string, name?: string) =>
    call<Background>('import_background_image', { sourcePath, name }),
  deleteBackground: (id: string) => call<void>('delete_background', { id }),
  setProfileBackground: (profileId: string, backgroundId: string | null) =>
    call<Profile>('set_profile_background', { profileId, backgroundId }),

  /* --- Prompt della Danger Zone ----------------------------------------- */
  saveDangerPrompt: (prompt: {
    id?: string;
    name: string;
    level: Exclude<DangerLevel, 'normal'>;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    confirmWord?: string;
  }) => call<DangerPrompt>('save_danger_prompt', { ...prompt }),
  deleteDangerPrompt: (id: string) => call<void>('delete_danger_prompt', { id }),

  /* --- Scorciatoie globali ---------------------------------------------- */
  applyGlobalShortcut: (kind: ShortcutKind, accelerator: string) =>
    call<ShortcutStatus>('apply_global_shortcut', { kind, accelerator }),
  getShortcutStatus: (kind: ShortcutKind) => call<ShortcutStatus>('get_shortcut_status', { kind }),
};

/** Le due scorciatoie globali registrate nell'OS. */
export type ShortcutKind = 'palette' | 'capture';
