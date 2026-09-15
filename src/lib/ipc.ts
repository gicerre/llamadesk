import { invoke } from '@tauri-apps/api/core';
import type { AppSettings } from '@/types/generated/AppSettings';
import type { BootstrapPayload } from '@/types/generated/BootstrapPayload';
import type { DeleteImpact } from '@/types/generated/DeleteImpact';
import type { Favorite } from '@/types/generated/Favorite';
import type { NewNode } from '@/types/generated/NewNode';
import type { Node } from '@/types/generated/Node';
import type { NodeEntry } from '@/types/generated/NodeEntry';
import type { NodePatch } from '@/types/generated/NodePatch';
import type { NodeView } from '@/types/generated/NodeView';
import type { PathInfo } from '@/types/generated/PathInfo';
import type { Profile } from '@/types/generated/Profile';
import type { ProfileDeleteImpact } from '@/types/generated/ProfileDeleteImpact';
import type { ProfilePatch } from '@/types/generated/ProfilePatch';
import type { ProfileSession } from '@/types/generated/ProfileSession';
import type { RecentAction } from '@/types/generated/RecentAction';
import type { ShortcutStatus } from '@/types/generated/ShortcutStatus';
import type { Tag } from '@/types/generated/Tag';
import type { WorkspaceEntry } from '@/types/generated/WorkspaceEntry';

/* ============================================================================
   Unico punto di contatto con il backend Rust.

   `Commands` elenca ogni comando con i suoi argomenti e il risultato: le
   funzioni di `api` sono solo nomi comodi sopra `call`. Nel browser
   (`npm run dev:vite`) i comandi finiscono a un backend simulato in memoria,
   caricato solo in quel caso.
   ========================================================================== */

type Id = string;
type Maybe<T> = T | null;

export interface Commands {
  bootstrap: { args: Record<string, never>; result: BootstrapPayload };
  complete_onboarding: { args: Record<string, never>; result: null };
  set_setting: { args: { key: string; value: string }; result: AppSettings };
  set_profile_setting: {
    args: { profileId: Id; key: string; value: Maybe<string> };
    result: AppSettings;
  };
  get_profile_overrides: { args: { profileId: Id }; result: string[] };
  profile_scoped_keys: { args: Record<string, never>; result: string[] };
  activate_profile: { args: { profileId: Id }; result: ProfileSession };
  list_profiles: { args: Record<string, never>; result: Profile[] };
  create_profile: { args: { name: string }; result: Profile };
  update_profile: { args: { id: Id; patch: ProfilePatch }; result: Profile };
  profile_delete_impact: { args: { id: Id }; result: ProfileDeleteImpact };
  delete_profile: { args: { id: Id }; result: ProfileSession };
  get_shortcut_status: { args: { kind: 'palette' | 'capture' }; result: ShortcutStatus };
  apply_global_shortcut: {
    args: { kind: 'palette' | 'capture'; accelerator: string };
    result: ShortcutStatus;
  };

  list_workspaces: {
    args: { profileId: Id; includeArchived?: boolean };
    result: WorkspaceEntry[];
  };
  workspace_profiles: { args: { workspaceId: Id }; result: Id[] };
  set_workspace_visibility: {
    args: { profileId: Id; workspaceId: Id; visible: boolean };
    result: null;
  };
  reorder_workspace: {
    args: { profileId: Id; workspaceId: Id; previousId: Maybe<Id>; nextId: Maybe<Id> };
    result: null;
  };
  set_default_workspace: { args: { profileId: Id; workspaceId: Id }; result: null };
  remember_workspace_route: {
    args: { profileId: Id; workspaceId: Id; route: string };
    result: null;
  };

  get_node_view: {
    args: { profileId: Id; id: Id; viaWorkspaceId: Maybe<Id>; includeArchived?: boolean };
    result: NodeView;
  };
  list_children: { args: { id: Id; includeArchived?: boolean }; result: NodeEntry[] };
  create_node: {
    args: {
      profileId: Id;
      parentId: Maybe<Id>;
      input: NewNode;
      previousId: Maybe<Id>;
      nextId: Maybe<Id>;
    };
    result: Node;
  };
  create_link_group: {
    args: { profileId: Id; parentId: Id; name: string; links: NewNode[] };
    result: Node;
  };
  update_node: { args: { id: Id; patch: NodePatch }; result: Node };
  move_node: {
    args: {
      id: Id;
      fromParentId: Maybe<Id>;
      toParentId: Id;
      previousId: Maybe<Id>;
      nextId: Maybe<Id>;
    };
    result: null;
  };
  share_node: { args: { id: Id; parentId: Id }; result: null };
  unshare_node: { args: { id: Id; parentId: Id }; result: null };
  set_node_pinned: { args: { parentId: Id; childId: Id; pinned: boolean }; result: null };
  archive_node: { args: { id: Id; archived: boolean }; result: Node };
  node_delete_impact: { args: { id: Id }; result: DeleteImpact };
  delete_node: { args: { id: Id }; result: string };
  restore_deletion: { args: { deletionId: string }; result: null };
  duplicate_node: {
    args: { profileId: Id; id: Id; parentId: Maybe<Id>; name: Maybe<string> };
    result: Node;
  };
  set_node_tags: { args: { id: Id; names: string[] }; result: Tag[] };
  list_tags: { args: Record<string, never>; result: Tag[] };

  toggle_favorite: {
    args: { profileId: Id; nodeId: Id; actionId: Maybe<string>; toolId: Maybe<Id> };
    result: boolean;
  };
  list_favorites: { args: { profileId: Id }; result: Favorite[] };
  list_recents: {
    args: { profileId: Id; workspaceId: Maybe<Id>; limit?: number };
    result: RecentAction[];
  };

  inspect_paths: { args: { pathsToInspect: string[] }; result: PathInfo[] };
}

export type CommandName = keyof Commands;
export type CommandArgs<K extends CommandName> = Commands[K]['args'];
export type CommandResult<K extends CommandName> = Commands[K]['result'];

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/** Gli errori di Rust arrivano come stringhe gia' leggibili. */
export class BackendError extends Error {
  constructor(
    readonly command: CommandName,
    message: string,
  ) {
    super(message);
    this.name = 'BackendError';
  }
}

export async function call<K extends CommandName>(
  command: K,
  args: CommandArgs<K>,
): Promise<CommandResult<K>> {
  try {
    if (isTauri()) {
      return await invoke<CommandResult<K>>(command, args as Record<string, unknown>);
    }
    const { mockCall } = await import('./mock/backend');
    return await mockCall(command, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BackendError(command, message);
  }
}

const none = {} as Record<string, never>;

export const api = {
  bootstrap: () => call('bootstrap', none),
  completeOnboarding: () => call('complete_onboarding', none),
  setSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    call('set_setting', { key, value: JSON.stringify(value) }),
  setProfileSetting: <K extends keyof AppSettings>(
    profileId: Id,
    key: K,
    value: AppSettings[K] | null,
  ) =>
    call('set_profile_setting', {
      profileId,
      key,
      value: value === null ? null : JSON.stringify(value),
    }),
  profileOverrides: (profileId: Id) => call('get_profile_overrides', { profileId }),
  profileScopedKeys: () => call('profile_scoped_keys', none),
  activateProfile: (profileId: Id) => call('activate_profile', { profileId }),
  listProfiles: () => call('list_profiles', none),
  createProfile: (name: string) => call('create_profile', { name }),
  updateProfile: (id: Id, patch: ProfilePatch) => call('update_profile', { id, patch }),
  profileDeleteImpact: (id: Id) => call('profile_delete_impact', { id }),
  deleteProfile: (id: Id) => call('delete_profile', { id }),

  listWorkspaces: (profileId: Id, includeArchived = false) =>
    call('list_workspaces', { profileId, includeArchived }),
  setWorkspaceVisibility: (profileId: Id, workspaceId: Id, visible: boolean) =>
    call('set_workspace_visibility', { profileId, workspaceId, visible }),
  setDefaultWorkspace: (profileId: Id, workspaceId: Id) =>
    call('set_default_workspace', { profileId, workspaceId }),
  rememberWorkspaceRoute: (profileId: Id, workspaceId: Id, route: string) =>
    call('remember_workspace_route', { profileId, workspaceId, route }),

  nodeView: (profileId: Id, id: Id, viaWorkspaceId: Maybe<Id>) =>
    call('get_node_view', { profileId, id, viaWorkspaceId }),
  children: (id: Id) => call('list_children', { id }),
  createNode: (profileId: Id, parentId: Maybe<Id>, input: NewNode) =>
    call('create_node', { profileId, parentId, input, previousId: null, nextId: null }),
  createLinkGroup: (profileId: Id, parentId: Id, name: string, links: NewNode[]) =>
    call('create_link_group', { profileId, parentId, name, links }),
  updateNode: (id: Id, patch: NodePatch) => call('update_node', { id, patch }),
  moveNode: (
    id: Id,
    fromParentId: Maybe<Id>,
    toParentId: Id,
    previousId: Maybe<Id>,
    nextId: Maybe<Id>,
  ) => call('move_node', { id, fromParentId, toParentId, previousId, nextId }),
  shareNode: (id: Id, parentId: Id) => call('share_node', { id, parentId }),
  setPinned: (parentId: Id, childId: Id, pinned: boolean) =>
    call('set_node_pinned', { parentId, childId, pinned }),
  archiveNode: (id: Id, archived: boolean) => call('archive_node', { id, archived }),
  duplicateNode: (profileId: Id, id: Id, parentId: Maybe<Id>, name: Maybe<string>) =>
    call('duplicate_node', { profileId, id, parentId, name }),
  setNodeTags: (id: Id, names: string[]) => call('set_node_tags', { id, names }),
  listTags: () => call('list_tags', none),
  unshareNode: (id: Id, parentId: Id) => call('unshare_node', { id, parentId }),
  deleteImpact: (id: Id) => call('node_delete_impact', { id }),
  deleteNode: (id: Id) => call('delete_node', { id }),
  restoreDeletion: (deletionId: string) => call('restore_deletion', { deletionId }),

  toggleFavorite: (profileId: Id, nodeId: Id) =>
    call('toggle_favorite', { profileId, nodeId, actionId: null, toolId: null }),
  favorites: (profileId: Id) => call('list_favorites', { profileId }),
  recents: (profileId: Id, workspaceId: Maybe<Id>, limit = 12) =>
    call('list_recents', { profileId, workspaceId, limit }),

  inspectPaths: (paths: string[]) => call('inspect_paths', { pathsToInspect: paths }),
};
