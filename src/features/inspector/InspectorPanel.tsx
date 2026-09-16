import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Folder, GitBranch, Pin, Plus, Trash2, Unlink, X } from 'lucide-react';
import { IconPicker } from '@/components/IconPicker';
import { NodeIcon } from '@/components/NodeIcon';
import { Button } from '@/components/ui/Button';
import { ColorField, inputClass, Segmented, Switch } from '@/components/ui/fields';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu';
import { Skeleton } from '@/components/ui/feedback';
import { Tip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { api } from '@/lib/ipc';
import { duration, easeOut } from '@/lib/motion';
import { useCompactWindow } from '@/lib/viewport';
import { canPickPaths, pickPaths } from '@/lib/pickers';
import {
  invalidateLibrary,
  useChildren,
  useNodeView,
  usePathInfos,
  useTags,
  useWorkspaces,
} from '@/lib/queries';
import { displayUrl, formatBytes, parseAddInput } from '@/lib/resources';
import { routeForChain } from '@/lib/routes';
import { useDialogs } from '@/stores/dialogs';
import { useInspector } from '@/stores/inspector';
import { useProfileId } from '@/stores/session';
import { toast, toastError } from '@/stores/toasts';
import type { Caution } from '@/types/generated/Caution';
import type { NodePatch } from '@/types/generated/NodePatch';
import type { NodeView } from '@/types/generated/NodeView';
import { ResourceQuickActions } from '../actions/ActionMenu';
import { isExecutable, primaryAction } from '../actions/registry';
import { runAction } from '../actions/run';
import { CoverField } from './CoverField';
import { InlineField, PanelSection } from './fields';
import { LaunchSection } from '../launch/LaunchSection';
import { UnlockForm } from '../protection/UnlockForm';
import { ProtectionSection } from './ProtectionSection';
import { OpeningSection, ToolPreferencesSection } from './ToolSections';

const INSPECTOR_WIDTH = 360;

/**
 * Pannello di dettaglio (docs/REDESIGN.md § 6): a destra, accanto alla pagina
 * che resta visibile. Qui si modifica tutto cio' che una pagina mostra ma non
 * serve per usare: nome, indirizzo, colori, icona, tag, conferma, workspace.
 */
export function InspectorPanel() {
  const { t } = useTranslation();
  const nodeId = useInspector((state) => state.nodeId);
  const workspaceId = useInspector((state) => state.workspaceId);
  // In una finestra stretta il pannello si appoggia sopra la pagina invece di stringerla.
  const overlay = useCompactWindow();

  return (
    <AnimatePresence initial={false}>
      {nodeId && workspaceId && (
        <motion.aside
          key={overlay ? 'inspector-overlay' : 'inspector'}
          aria-label={t('inspector.title')}
          initial={overlay ? { x: INSPECTOR_WIDTH, opacity: 0 } : { width: 0, opacity: 0 }}
          animate={overlay ? { x: 0, opacity: 1 } : { width: INSPECTOR_WIDTH, opacity: 1 }}
          exit={overlay ? { x: INSPECTOR_WIDTH, opacity: 0 } : { width: 0, opacity: 0 }}
          transition={{ duration: duration.sidebar, ease: easeOut }}
          className={
            overlay
              ? 'border-line bg-surface shadow-3 absolute inset-y-0 right-0 z-30 max-w-full overflow-hidden border-l'
              : 'border-line bg-surface h-full shrink-0 overflow-hidden border-l'
          }
        >
          <div className="h-full overflow-y-auto" style={{ width: INSPECTOR_WIDTH }}>
            <InspectorContent key={nodeId} nodeId={nodeId} workspaceId={workspaceId} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function InspectorContent({ nodeId, workspaceId }: { nodeId: string; workspaceId: string }) {
  const { t } = useTranslation();
  const close = useInspector((state) => state.close);
  const view = useNodeView(nodeId, workspaceId);

  if (view.isError) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Header onClose={close} />
        <p className="text-ink-2 text-sm">{t('errors.nodeMissing')}</p>
      </div>
    );
  }
  if (!view.data) {
    return (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-8" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  if (view.data.locked) {
    return (
      <div className="flex flex-col gap-3 pb-4">
        <Header view={view.data} onClose={close} />
        <p className="text-ink-2 px-4 text-sm">{t('lock.lockedDescription')}</p>
        <UnlockForm className="px-4" />
      </div>
    );
  }

  return <Editor view={view.data} workspaceId={workspaceId} />;
}

function Header({ view, onClose }: { view?: NodeView; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <header className="bg-surface sticky top-0 z-10 flex items-center gap-2.5 px-4 pt-3.5 pb-3">
      {view && (
        <NodeIcon
          kind={view.node.kind}
          name={view.node.name}
          icon={view.node.icon}
          color={view.node.colorMain}
          size="md"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-2xs text-ink-3 font-semibold tracking-[0.08em] uppercase">
          {view ? t(`kinds.one.${view.node.kind}`) : t('inspector.title')}
        </p>
        {view && <p className="text-ink truncate text-sm font-semibold">{view.node.name}</p>}
      </div>
      <Tip label={t('inspector.close')} shortcut="Esc">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t('inspector.close')}
          onClick={onClose}
        >
          <X />
        </Button>
      </Tip>
    </header>
  );
}

function Editor({ view, workspaceId }: { view: NodeView; workspaceId: string }) {
  const { t } = useTranslation();
  const close = useInspector((state) => state.close);
  const openDelete = useDialogs((state) => state.openDelete);
  const { node } = view;

  const save = async (patch: NodePatch) => {
    await api.updateNode(node.id, patch);
    await invalidateLibrary();
  };

  const identity = ['workspace', 'project', 'subproject', 'section'].includes(node.kind);

  return (
    <div
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !(event.target instanceof HTMLInputElement)) close();
      }}
    >
      <Header view={view} onClose={close} />
      {isExecutable(node.kind) && <RunBar view={view} workspaceId={workspaceId} />}

      <PanelSection title={t('inspector.general')} className="border-t-0 pt-1">
        <InlineField
          label={t('create.name')}
          value={node.name}
          required
          onCommit={(name) => save({ name })}
        />
        {node.kind === 'link' && (
          <InlineField
            label={t('inspector.url')}
            value={node.url}
            mono
            onCommit={(url) => save({ url })}
          />
        )}
        {node.kind === 'path' && <PathField view={view} onSave={save} />}
        <InlineField
          label={t('inspector.description')}
          value={node.description}
          multiline
          onCommit={(description) => save({ description: description.trim() || null })}
        />
        <InlineField
          label={t('inspector.aliases')}
          value={node.aliases}
          hint={t('inspector.aliasesHint')}
          onCommit={(aliases) => save({ aliases: aliases.trim() || null })}
        />
      </PanelSection>

      {node.kind === 'link_group' && <GroupLinks groupId={node.id} />}

      {(node.kind === 'link' || node.kind === 'link_group') && (
        <OpeningSection view={view} onSave={save} />
      )}
      {(identity || node.kind === 'path') && (
        <ToolPreferencesSection
          view={view}
          workspaceId={workspaceId}
          kinds={node.kind === 'path' ? ['ide', 'terminal'] : ['ide', 'terminal', 'browser']}
        />
      )}

      {identity && <Appearance view={view} onSave={save} />}

      <PanelSection title={t('inspector.tags')}>
        <TagEditor view={view} />
      </PanelSection>

      {['project', 'subproject', 'section'].includes(node.kind) && <LaunchSection view={view} />}

      <ProtectionSection view={view} />

      <CautionSection view={view} onSave={save} />

      {node.kind === 'project' && <WorkspacesSection view={view} workspaceId={workspaceId} />}

      <PanelSection title={t('inspector.danger')}>
        <Button
          variant="ghost"
          className="text-danger hover:bg-danger-soft hover:text-danger justify-start"
          onClick={() =>
            openDelete({
              id: node.id,
              name: node.name,
              kind: node.kind,
              fallbackRoute: routeForChain(workspaceId, view.breadcrumb.slice(0, -1)),
            })
          }
        >
          <Trash2 />
          {view.workspaces.length > 1 && node.kind === 'project'
            ? t('delete.action.everywhere')
            : t(`delete.action.${node.kind}`)}
        </Button>
      </PanelSection>
    </div>
  );
}

/** L'azione principale a portata di mano anche dal pannello. */
function RunBar({ view, workspaceId }: { view: NodeView; workspaceId: string }) {
  const { t } = useTranslation();
  const { node } = view;
  const infos = usePathInfos(node.path ? [node.path] : []);
  const pathInfo = node.path ? infos.data?.get(node.path) : undefined;
  const primary = primaryAction({ node, pathInfo });
  if (!primary) return null;

  return (
    <div className="flex items-center gap-2 px-4 pb-3">
      <Button
        variant="primary"
        onClick={() => void runAction({ node, actionId: primary.id, workspaceId })}
      >
        {t(`actions.run.${primary.label}`)}
      </Button>
      <span className="flex-1" />
      <ResourceQuickActions node={node} pathInfo={pathInfo} workspaceId={workspaceId} />
    </div>
  );
}

function PathField({
  view,
  onSave,
}: {
  view: NodeView;
  onSave: (patch: NodePatch) => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const { node } = view;
  const info = usePathInfos(node.path ? [node.path] : []).data?.get(node.path ?? '');

  const browse = async () => {
    const [path] = await pickPaths({ directory: info?.kind !== 'file', multiple: false });
    if (path)
      await onSave({ path }).catch((error) => toastError(t('resources.locateFailed'), error));
  };

  return (
    <div className="flex flex-col gap-2">
      <InlineField
        label={t('inspector.path')}
        value={node.path}
        mono
        onCommit={(path) => onSave({ path })}
      />
      <div className="text-ink-3 flex flex-wrap items-center gap-2 text-xs">
        {info && (
          <span
            className={cn(
              info.kind === 'missing' || info.kind === 'unavailable' ? 'text-caution' : '',
            )}
          >
            {t(`resources.pathKind.${info.kind}`)}
          </span>
        )}
        {info?.sizeBytes !== null && info?.sizeBytes !== undefined && (
          <span>· {formatBytes(info.sizeBytes, i18n.language)}</span>
        )}
        {info?.gitBranch && (
          <span className="flex items-center gap-1">
            · <GitBranch className="size-3" aria-hidden /> {info.gitBranch}
          </span>
        )}
        {info?.isNetwork && <span>· {t('resources.network')}</span>}
        {canPickPaths() && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => void browse()}>
            <Folder />
            {t('add.browse')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** I link di un gruppo: attivi o esclusi dall'apertura, riordinabili, aggiungibili. */
function GroupLinks({ groupId }: { groupId: string }) {
  const { t } = useTranslation();
  const profileId = useProfileId();
  const children = useChildren(groupId);
  const [text, setText] = useState('');
  const links = children.data ?? [];

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toastError(t('inspector.groupFailed'), error);
    } finally {
      await invalidateLibrary();
    }
  };

  const add = () => {
    const intent = parseAddInput(text);
    const toCreate =
      intent.kind === 'link' ? [intent] : intent.kind === 'link_group' ? intent.links : [];
    if (toCreate.length === 0) {
      toast({ title: t('inspector.notUrls'), tone: 'error' });
      return;
    }
    void run(async () => {
      for (const link of toCreate) {
        await api.createNode(profileId, groupId, { kind: 'link', name: link.name, url: link.url });
      }
      setText('');
    });
  };

  return (
    <PanelSection title={t('inspector.links', { count: links.length })}>
      <p className="text-ink-3 text-xs">{t('inspector.linksHint')}</p>
      <ul className="flex flex-col gap-1">
        {links.map((entry, index) => (
          <li
            key={entry.node.id}
            className="group/link flex min-w-0 items-center gap-2 rounded-sm py-1"
          >
            <Switch
              checked={entry.node.enabled}
              onCheckedChange={(enabled) =>
                void run(() => api.updateNode(entry.node.id, { enabled }))
              }
            />
            <span className={cn('min-w-0 flex-1', !entry.node.enabled && 'opacity-50')}>
              <span className="text-ink block truncate text-sm font-medium">{entry.node.name}</span>
              <span className="text-2xs text-ink-3 block truncate font-mono">
                {displayUrl(entry.node.url)}
              </span>
            </span>
            <span className="flex opacity-0 transition-opacity group-focus-within/link:opacity-100 group-hover/link:opacity-100">
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={t('inspector.moveUp')}
                disabled={index === 0}
                onClick={() =>
                  void run(() =>
                    api.moveNode(
                      entry.node.id,
                      groupId,
                      groupId,
                      links[index - 2]?.node.id ?? null,
                      links[index - 1]?.node.id ?? null,
                    ),
                  )
                }
              >
                <ArrowUp />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={t('inspector.moveDown')}
                disabled={index === links.length - 1}
                onClick={() =>
                  void run(() =>
                    api.moveNode(
                      entry.node.id,
                      groupId,
                      groupId,
                      links[index + 1]?.node.id ?? null,
                      links[index + 2]?.node.id ?? null,
                    ),
                  )
                }
              >
                <ArrowDown />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={t('inspector.removeLink', { name: entry.node.name })}
                onClick={() => void run(() => api.deleteNode(entry.node.id))}
              >
                <X />
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && add()}
          placeholder={t('inspector.addLinkPlaceholder')}
          aria-label={t('inspector.addLink')}
          className={cn(inputClass, 'font-mono text-xs')}
        />
        <Button onClick={add} iconOnly aria-label={t('inspector.addLink')}>
          <Plus />
        </Button>
      </div>
    </PanelSection>
  );
}

function Appearance({
  view,
  onSave,
}: {
  view: NodeView;
  onSave: (patch: NodePatch) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { node } = view;
  const colored = node.kind === 'workspace' || node.kind === 'project';

  const apply = (patch: NodePatch) =>
    void onSave(patch).catch((error) => toastError(t('settings.saveFailed'), error));

  return (
    <PanelSection title={t('inspector.appearance')}>
      {colored && (
        <>
          <ColorField
            label={t('create.color')}
            value={node.colorMain}
            onChange={(colorMain) => apply({ colorMain })}
            presetLabel={(key) => t(`colors.${key}`)}
          />
          {node.kind === 'project' && node.colorMain && (
            <Button
              variant="ghost"
              size="sm"
              className="self-start"
              onClick={() => apply({ colorMain: null })}
            >
              {t('inspector.inheritColor')}
            </Button>
          )}
        </>
      )}
      <IconPicker
        label={t('inspector.icon')}
        defaultLabel={t('inspector.iconDefault')}
        value={node.icon}
        onChange={(icon) => apply({ icon })}
        preview={(icon) => (
          <NodeIcon
            kind={node.kind}
            name={node.name}
            icon={icon}
            color={node.colorMain}
            size="xs"
          />
        )}
      />
      {colored && <CoverField view={view} onSave={onSave} />}
    </PanelSection>
  );
}

function TagEditor({ view }: { view: NodeView }) {
  const { t } = useTranslation();
  const known = useTags();
  const [text, setText] = useState('');
  const names = view.tags.map((tag) => tag.name);

  const commit = async (next: string[]) => {
    try {
      await api.setNodeTags(view.node.id, next);
      await invalidateLibrary();
    } catch (error) {
      toastError(t('inspector.tagsFailed'), error);
    }
  };

  const add = () => {
    const name = text.trim().replace(/^#/, '');
    if (!name) return;
    setText('');
    if (!names.some((existing) => existing.toLowerCase() === name.toLowerCase()))
      void commit([...names, name]);
  };

  const suggestions = (known.data ?? [])
    .map((tag) => tag.name)
    .filter(
      (name) => !names.includes(name) && name.toLowerCase().startsWith(text.trim().toLowerCase()),
    )
    .slice(0, 6);

  return (
    <div className="flex flex-col gap-2">
      {names.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {names.map((name) => (
            <li
              key={name}
              className="bg-hover text-ink-2 flex h-6 items-center gap-1 rounded-full pr-1 pl-2.5 text-xs"
            >
              #{name}
              <button
                type="button"
                aria-label={t('inspector.removeTag', { name })}
                onClick={() => void commit(names.filter((existing) => existing !== name))}
                className="hover:bg-press flex size-4 items-center justify-center rounded-full"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ',') {
            event.preventDefault();
            add();
          }
        }}
        placeholder={t('inspector.tagPlaceholder')}
        aria-label={t('inspector.tags')}
        className={inputClass}
      />
      {text.trim() && suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setText('');
                void commit([...names, name]);
              }}
              className="text-ink-2 hover:bg-hover h-6 rounded-full px-2.5 text-xs shadow-[inset_0_0_0_1px_var(--ld-line-strong)]"
            >
              #{name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CautionSection({
  view,
  onSave,
}: {
  view: NodeView;
  onSave: (patch: NodePatch) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { node, caution } = view;
  const value = node.caution ?? 'inherit';

  const inherited = caution.isOwn
    ? null
    : caution.inheritedFrom
      ? t('inspector.cautionInherited', {
          level: t(`inspector.cautionLevel.${caution.level}`),
          name: caution.inheritedFrom.name,
        })
      : t('inspector.cautionNone');

  return (
    <PanelSection title={t('inspector.caution')}>
      <p className="text-ink-3 text-xs">{t('inspector.cautionHint')}</p>
      <Segmented
        label={t('inspector.caution')}
        value={value}
        onChange={(next) =>
          void onSave({ caution: next === 'inherit' ? null : (next as Caution) }).catch((error) =>
            toastError(t('settings.saveFailed'), error),
          )
        }
        options={[
          { value: 'inherit', label: t('inspector.cautionLevel.inherit') },
          { value: 'none', label: t('inspector.cautionLevel.none') },
          { value: 'confirm', label: t('inspector.cautionLevel.confirm') },
          { value: 'type_name', label: t('inspector.cautionLevel.type_name') },
        ]}
      />
      {value === 'inherit' && inherited && <p className="text-ink-3 text-xs">{inherited}</p>}
    </PanelSection>
  );
}

/** Dove compare un progetto: stesso progetto, piu' workspace (D1, condivisione). */
function WorkspacesSection({ view, workspaceId }: { view: NodeView; workspaceId: string }) {
  const { t } = useTranslation();
  const workspaces = useWorkspaces();
  const { node } = view;
  const edge = view.workspaces.some((crumb) => crumb.id === workspaceId);
  const pinned =
    useChildren(workspaceId).data?.find((entry) => entry.node.id === node.id)?.isPinned ?? false;
  const others = (workspaces.data ?? []).filter(
    (entry) => !view.workspaces.some((crumb) => crumb.id === entry.node.id),
  );

  const run = async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      await invalidateLibrary();
      if (success) toast({ title: success });
    } catch (error) {
      toastError(t('inspector.workspacesFailed'), error);
    }
  };

  return (
    <PanelSection title={t('inspector.workspaces')}>
      {view.workspaces.length > 1 && (
        <p className="text-ink-3 text-xs">
          {t('inspector.sharedHint', { count: view.workspaces.length })}
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {view.workspaces.map((crumb) => (
          <li key={crumb.id} className="flex items-center gap-2.5 py-0.5">
            <NodeIcon
              kind="workspace"
              name={crumb.name}
              icon={crumb.icon}
              color={crumb.colorMain}
              size="sm"
            />
            <span className="text-ink min-w-0 flex-1 truncate text-sm">{crumb.name}</span>
            {view.workspaces.length > 1 && (
              <Tip label={t('actions.unshare', { workspace: crumb.name })}>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={t('actions.unshare', { workspace: crumb.name })}
                  onClick={() => void run(() => api.unshareNode(node.id, crumb.id))}
                >
                  <Unlink />
                </Button>
              </Tip>
            )}
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="sm" className="self-start">
              <Plus />
              {t('inspector.shareWith')}
            </Button>
          </MenuTrigger>
          <MenuContent>
            {others.map((entry) => (
              <MenuItem
                key={entry.node.id}
                icon={
                  <NodeIcon
                    kind="workspace"
                    name={entry.node.name}
                    icon={entry.node.icon}
                    color={entry.node.colorMain}
                    size="sm"
                  />
                }
                onSelect={() =>
                  void run(
                    () => api.shareNode(node.id, entry.node.id),
                    t('inspector.shared', { name: node.name, workspace: entry.node.name }),
                  )
                }
              >
                {entry.node.name}
              </MenuItem>
            ))}
          </MenuContent>
        </Menu>
      )}
      {edge && (
        <label className="text-ink flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2">
            <Pin className="text-ink-3 size-4" aria-hidden />
            {t('inspector.pinned')}
          </span>
          <Switch
            checked={pinned}
            onCheckedChange={(value) => void run(() => api.setPinned(workspaceId, node.id, value))}
          />
        </label>
      )}
    </PanelSection>
  );
}
