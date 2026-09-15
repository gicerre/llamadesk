import { createElement, useEffect, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Dialog as Primitive } from 'radix-ui';
import {
  ArrowLeft,
  ChevronRight,
  CornerDownLeft,
  LocateFixed,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
  type LucideIcon,
} from 'lucide-react';
import { NodeIcon } from '@/components/NodeIcon';
import { Kbd } from '@/components/ui/Kbd';
import { cn } from '@/lib/cn';
import { scoreText } from '@/lib/fuzzy';
import { api } from '@/lib/ipc';
import { invalidateLibrary, usePathInfos, useRecents, useTools } from '@/lib/queries';
import { currentNodeId, parseNodeRoute, routeForChain } from '@/lib/routes';
import { useDialogs } from '@/stores/dialogs';
import { useInspector } from '@/stores/inspector';
import { usePalette } from '@/stores/palette';
import { useProfileId } from '@/stores/session';
import { toast, toastError } from '@/stores/toasts';
import { useUi } from '@/stores/ui';
import type { Node } from '@/types/generated/Node';
import type { PathInfo } from '@/types/generated/PathInfo';
import type { RecentAction } from '@/types/generated/RecentAction';
import type { SearchHit } from '@/types/generated/SearchHit';
import type { SuggestedAction } from '@/types/generated/SuggestedAction';
import { rerun, useRecentDescription } from '../actions/recents';
import { actionsFor, isExecutable, primaryAction, type ActionId } from '../actions/registry';
import { runAction } from '../actions/run';
import { buildCommands, SUGGESTED_COMMANDS, type CommandDef } from './commands';

/* ============================================================================
   Command palette (docs/REDESIGN.md § 7).

   Invio esegue l'azione principale (o quella proposta dalla ricerca: "camunda
   term"), Tab apre le altre azioni dell'elemento, Ctrl+Invio porta dove
   l'elemento si trova. A palette vuota: le ultime azioni e pochi comandi.
   `>` mostra solo i comandi, `@` solo i contenitori, `#tag` filtra per tag.
   ========================================================================== */

type Item =
  | { type: 'hit'; key: string; hit: SearchHit }
  | { type: 'recent'; key: string; recent: RecentAction }
  | { type: 'command'; key: string; command: CommandDef };

interface Group {
  title: string;
  items: Item[];
}

interface ActionEntry {
  key: string;
  label: string;
  icon: LucideIcon;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = usePalette((state) => state.open);
  const hide = usePalette((state) => state.hide);
  const initialText = usePalette((state) => state.initialText);

  return (
    <Primitive.Root open={open} onOpenChange={(next) => !next && hide()}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-40 bg-black/20 data-[state=open]:animate-[fade-in_140ms_var(--ease-out)] dark:bg-black/40" />
        {open && <PaletteBody key={initialText} initialText={initialText} />}
      </Primitive.Portal>
    </Primitive.Root>
  );
}

function PaletteBody({ initialText }: { initialText: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const profileId = useProfileId();
  const hide = usePalette((state) => state.hide);
  const lastWorkspaceId = useUi((state) => state.lastWorkspaceId);
  const listId = useId();

  const route = parseNodeRoute(pathname);
  const workspaceId = route.workspaceId ?? lastWorkspaceId;
  const pageNodeId = currentNodeId(route) ?? null;

  const [text, setText] = useState(initialText);
  const [debounced, setDebounced] = useState(initialText);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [actionItem, setActionItem] = useState<Item | null>(null);
  const [actionIndex, setActionIndex] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(text), 70);
    return () => window.clearTimeout(timer);
  }, [text]);

  const trimmed = debounced.trim();
  const commandMode = trimmed.startsWith('>');
  const search = useQuery({
    queryKey: ['search', profileId, trimmed, workspaceId, pageNodeId],
    queryFn: () => api.search(profileId, trimmed, workspaceId, pageNodeId, 30),
    enabled: profileId !== '' && trimmed !== '' && !commandMode,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });
  const recents = useRecents(workspaceId);
  const tools = useTools();
  const toolsList = tools.data;

  const commands = useMemo(
    () => buildCommands(t, { navigate, workspaceId, pageNodeId }),
    [t, navigate, workspaceId, pageNodeId],
  );

  const groups: Group[] = useMemo(() => {
    const commandItems = (list: CommandDef[]): Item[] =>
      list.map((command) => ({ type: 'command', key: `command:${command.id}`, command }));

    if (trimmed === '') {
      return [
        {
          title: t('palette.continue'),
          items: (recents.data ?? []).slice(0, 5).map((recent) => ({
            type: 'recent' as const,
            key: `recent:${recent.node.id}:${recent.actionId}:${recent.toolId ?? ''}`,
            recent,
          })),
        },
        {
          title: t('palette.commandsTitle'),
          items: commandItems(
            commands.filter((command) => SUGGESTED_COMMANDS.includes(command.id)),
          ),
        },
      ].filter((group) => group.items.length > 0);
    }

    const commandQuery = commandMode ? trimmed.slice(1).trim() : trimmed;
    const matching = commands
      .map((command) => ({
        command,
        score: commandQuery
          ? Math.max(
              scoreText(commandQuery, command.label),
              scoreText(commandQuery, command.keywords) * 0.9,
            )
          : 1,
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((entry) => entry.command);

    if (commandMode) {
      return [{ title: t('palette.commandsTitle'), items: commandItems(matching) }];
    }
    return [
      {
        title: t('palette.results'),
        items: (search.data ?? []).map((hit) => ({
          type: 'hit' as const,
          key: `hit:${hit.node.id}:${hit.action?.actionId ?? ''}`,
          hit,
        })),
      },
      { title: t('palette.commandsTitle'), items: commandItems(matching.slice(0, 4)) },
    ].filter((group) => group.items.length > 0);
  }, [trimmed, commandMode, recents.data, search.data, commands, t]);

  const items = groups.flatMap((group) => group.items);
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.key === selectedKey),
  );
  const selected = items[selectedIndex];

  const hitPaths = (search.data ?? []).flatMap((hit) =>
    hit.node.kind === 'path' && hit.node.path ? [hit.node.path] : [],
  );
  const pathInfos = usePathInfos(hitPaths);
  const infoOf = (node: Node) => (node.path ? pathInfos.data?.get(node.path) : undefined);

  useEffect(() => {
    document
      .querySelector(`[data-palette-key="${CSS.escape(selected?.key ?? '')}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected?.key]);

  /* ------------------------------------------------------------ esecuzione */

  const goToLocation = async (node: Node, via: string | null, chain?: SearchHit['breadcrumb']) => {
    try {
      const breadcrumb = chain ?? (await api.nodeView(profileId, node.id, via)).breadcrumb;
      const workspace = via ?? breadcrumb[0]?.id;
      if (!workspace) return;
      if (isExecutable(node.kind)) {
        navigate(routeForChain(workspace, breadcrumb.slice(0, -1)));
        useInspector.getState().open(node.id, workspace);
      } else {
        navigate(routeForChain(workspace, breadcrumb));
      }
    } catch (error) {
      toastError(t('errors.nodeMissing'), error);
    }
  };

  const runSuggested = (hit: SearchHit, action: SuggestedAction) =>
    void runAction({
      node: action.target,
      actionId: action.actionId as ActionId,
      toolId: action.toolId,
      workspaceId: hit.workspaceId,
    });

  const execute = (item: Item | undefined, location = false) => {
    if (!item) return;
    hide();
    if (item.type === 'command') {
      item.command.run();
      return;
    }
    if (item.type === 'recent') {
      if (location) void goToLocation(item.recent.node, item.recent.viaWorkspaceId ?? workspaceId);
      else void rerun(item.recent, workspaceId);
      return;
    }
    const { hit } = item;
    if (location) {
      void goToLocation(hit.node, hit.workspaceId, hit.breadcrumb);
    } else if (hit.action) {
      runSuggested(hit, hit.action);
    } else if (isExecutable(hit.node.kind)) {
      const primary = primaryAction({ node: hit.node, pathInfo: infoOf(hit.node) });
      if (primary) {
        void runAction({ node: hit.node, actionId: primary.id, workspaceId: hit.workspaceId });
      } else {
        void goToLocation(hit.node, hit.workspaceId, hit.breadcrumb);
      }
    } else {
      navigate(routeForChain(hit.workspaceId, hit.breadcrumb));
    }
  };

  const entries = actionItem ? buildActionEntries(actionItem) : [];

  function buildActionEntries(item: Item): ActionEntry[] {
    if (item.type === 'command') return [];
    const node = item.type === 'hit' ? item.hit.node : item.recent.node;
    const via =
      item.type === 'hit' ? item.hit.workspaceId : (item.recent.viaWorkspaceId ?? workspaceId);
    const chain = item.type === 'hit' ? item.hit.breadcrumb : undefined;
    const done = (run: () => void) => () => {
      hide();
      run();
    };
    return [
      ...(isExecutable(node.kind)
        ? resourceEntries(node, via, infoOf(node), done)
        : [
            {
              key: 'go',
              label: t('palette.go'),
              icon: ChevronRight,
              hint: t('actions.enter'),
              run: done(() => void goToLocation(node, via, chain)),
            },
            ...(via
              ? [
                  {
                    key: 'add',
                    label: t('add.titleIn', { name: node.name }),
                    icon: Plus,
                    run: done(() =>
                      useDialogs.getState().openAdd({ parentId: node.id, workspaceId: via }),
                    ),
                  },
                ]
              : []),
          ]),
      ...(isExecutable(node.kind)
        ? [
            {
              key: 'location',
              label: t('palette.location'),
              icon: LocateFixed,
              hint: 'Ctrl+↵',
              run: done(() => void goToLocation(node, via, chain)),
            },
          ]
        : []),
      ...(via
        ? [
            {
              key: 'inspect',
              label: t('inspector.open'),
              icon: SlidersHorizontal,
              run: done(() => useInspector.getState().open(node.id, via)),
            },
          ]
        : []),
      {
        key: 'favorite',
        label: t('palette.toggleFavorite'),
        icon: Star,
        run: done(
          () =>
            void api
              .toggleFavorite(profileId, node.id)
              .then((added) => {
                toast({ title: t(added ? 'actions.favoriteAdded' : 'actions.favoriteRemoved') });
                return invalidateLibrary();
              })
              .catch((error) => toastError(t('actions.favoriteFailed'), error)),
        ),
      },
    ];
  }

  /* -------------------------------------------------------------- tastiera */

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (actionItem) {
      const count = entries.length;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        setActionIndex((index) => (index + step + count) % Math.max(count, 1));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        entries[actionIndex]?.run();
      } else if (
        event.key === 'Escape' ||
        (event.key === 'Tab' && event.shiftKey) ||
        (event.key === 'Backspace' && text === '')
      ) {
        event.preventDefault();
        event.stopPropagation();
        setActionItem(null);
      } else if (event.key === 'Tab') {
        event.preventDefault();
      }
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (items.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = items[(selectedIndex + step + items.length) % items.length];
      setSelectedKey(next?.key ?? null);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      execute(selected, event.ctrlKey);
    } else if (event.key === 'Tab') {
      event.preventDefault();
      if (selected && selected.type !== 'command') {
        setActionItem(selected);
        setActionIndex(0);
      }
    }
  };

  const recentDescription = useRecentDescription();

  return (
    <Primitive.Content
      aria-describedby={undefined}
      onKeyDown={onKeyDown}
      onEscapeKeyDown={(event) => {
        if (actionItem) event.preventDefault();
      }}
      className={cn(
        'bg-raised shadow-3 fixed top-[12vh] left-1/2 z-50 flex max-h-[min(560px,76vh)] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-xl',
        'data-[state=open]:animate-[dialog-in_160ms_var(--ease-out)]',
      )}
    >
      <Primitive.Title className="sr-only">{t('palette.title')}</Primitive.Title>

      <div className="border-line flex h-12 shrink-0 items-center gap-2.5 border-b px-4">
        {actionItem ? (
          <button
            type="button"
            onClick={() => setActionItem(null)}
            aria-label={t('palette.back')}
            className="text-ink-3 hover:text-ink -ml-1 rounded-sm p-1"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </button>
        ) : (
          <Search className="text-ink-3 size-4 shrink-0" aria-hidden />
        )}
        <input
          autoFocus
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSelectedKey(null);
            setActionItem(null);
          }}
          placeholder={actionItem ? itemName(actionItem) : t('palette.placeholder')}
          role="combobox"
          aria-expanded
          aria-controls={listId}
          aria-activedescendant={selected ? `${listId}-${selectedIndex}` : undefined}
          aria-label={t('palette.title')}
          spellCheck={false}
          autoComplete="off"
          className="text-ink placeholder:text-ink-3 h-full min-w-0 flex-1 bg-transparent text-base outline-none"
        />
        <Kbd>Esc</Kbd>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5" role="listbox" id={listId}>
        {actionItem ? (
          <>
            <p className="text-2xs text-ink-3 px-2.5 pt-1.5 pb-1 font-semibold tracking-[0.06em] uppercase">
              {t('palette.actionsFor', { name: itemName(actionItem) })}
            </p>
            {entries.map((entry, index) => (
              <Row
                key={entry.key}
                active={index === actionIndex}
                onHover={() => setActionIndex(index)}
                onClick={entry.run}
                leading={
                  <span className="bg-hover text-ink-2 flex size-7 items-center justify-center rounded-md">
                    {createElement(entry.icon, { className: 'size-4' })}
                  </span>
                }
                title={entry.label}
                trailing={entry.hint && <span className="text-2xs text-ink-3">{entry.hint}</span>}
              />
            ))}
          </>
        ) : items.length === 0 ? (
          <p className="text-ink-3 px-3 py-8 text-center text-sm">
            {trimmed === ''
              ? t('palette.emptyHint')
              : search.isFetching
                ? t('common.loading')
                : t('palette.noResults', { text: trimmed })}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.title} className="pb-1">
              <p className="text-2xs text-ink-3 px-2.5 pt-2 pb-1 font-semibold tracking-[0.06em] uppercase">
                {group.title}
              </p>
              {group.items.map((item) => {
                const index = items.indexOf(item);
                return (
                  <ItemRow
                    key={item.key}
                    id={`${listId}-${index}`}
                    item={item}
                    active={index === selectedIndex}
                    pathInfo={item.type === 'hit' ? infoOf(item.hit.node) : undefined}
                    recentDescription={recentDescription}
                    onHover={() => setSelectedKey(item.key)}
                    onClick={(event) => execute(item, event.ctrlKey)}
                  />
                );
              })}
            </div>
          ))
        )}
      </div>

      <footer className="border-line text-2xs text-ink-3 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2">
        <span className="flex items-center gap-1.5">
          <Kbd>
            <CornerDownLeft className="size-3" aria-hidden />
          </Kbd>
          {actionItem ? t('palette.hintRun') : t('palette.hintOpen')}
        </span>
        {!actionItem && (
          <>
            <span className="flex items-center gap-1.5">
              <Kbd>Tab</Kbd>
              {t('palette.hintActions')}
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Ctrl+↵</Kbd>
              {t('palette.hintLocation')}
            </span>
          </>
        )}
        <span className="ml-auto hidden sm:inline">{t('palette.hintPrefixes')}</span>
      </footer>
    </Primitive.Content>
  );

  function resourceEntries(
    node: Node,
    via: string | null,
    pathInfo: PathInfo | undefined,
    done: (run: () => void) => () => void,
  ): ActionEntry[] {
    return actionsFor({ node, pathInfo }).flatMap((action): ActionEntry[] => {
      const run = (toolId: string | null) =>
        done(() => void runAction({ node, actionId: action.id, toolId, workspaceId: via }));
      if (!action.tool) {
        return [
          {
            key: `${action.id}-${action.label}`,
            label: t(`actions.run.${action.label}`),
            icon: action.icon,
            hint: action.weight === 'primary' ? t('actions.enter') : undefined,
            run: run(null),
          },
        ];
      }
      const choices = (toolsList ?? []).filter(
        (tool) => tool.kind === action.tool && tool.available,
      );
      return choices.map((tool) => ({
        key: `${action.id}-${action.label}-${tool.id}`,
        label:
          action.tool === 'browser'
            ? `${t(`actions.run.${action.label}`)} ${tool.name}`
            : t(`actions.run.${action.label}Tool`, { tool: tool.name }),
        icon: action.icon,
        run: run(tool.id),
      }));
    });
  }
}

/* ------------------------------------------------------------------ righe */

function itemName(item: Item) {
  if (item.type === 'hit') return item.hit.node.name;
  if (item.type === 'recent') return item.recent.node.name;
  return item.command.label;
}

function Row({
  id,
  active,
  onHover,
  onClick,
  leading,
  title,
  subtitle,
  trailing,
}: {
  id?: string;
  active: boolean;
  onHover: () => void;
  onClick: (event: React.MouseEvent) => void;
  leading: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onClick}
      className={cn(
        'flex min-h-11 cursor-default items-center gap-3 rounded-md px-2.5 py-1.5',
        active && 'bg-hover',
      )}
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-sm">{title}</span>
        {subtitle && <span className="text-2xs text-ink-3 block truncate">{subtitle}</span>}
      </span>
      {trailing}
    </div>
  );
}

function ItemRow({
  id,
  item,
  active,
  pathInfo,
  recentDescription,
  onHover,
  onClick,
}: {
  id: string;
  item: Item;
  active: boolean;
  pathInfo: PathInfo | undefined;
  recentDescription: (recent: RecentAction) => string;
  onHover: () => void;
  onClick: (event: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();

  if (item.type === 'command') {
    const { command } = item;
    return (
      <div data-palette-key={item.key}>
        <Row
          id={id}
          active={active}
          onHover={onHover}
          onClick={onClick}
          leading={
            <span className="bg-hover text-ink-2 flex size-7 items-center justify-center rounded-md">
              {createElement(command.icon, { className: 'size-4' })}
            </span>
          }
          title={command.label}
          trailing={command.shortcut && <Kbd>{command.shortcut}</Kbd>}
        />
      </div>
    );
  }

  const node = item.type === 'hit' ? item.hit.node : item.recent.node;
  const leading = (
    <span className="flex size-7 shrink-0 items-center justify-center">
      <NodeIcon
        kind={node.kind}
        name={node.name}
        icon={node.icon}
        color={node.colorMain}
        size="sm"
      />
    </span>
  );

  if (item.type === 'recent') {
    return (
      <div data-palette-key={item.key}>
        <Row
          id={id}
          active={active}
          onHover={onHover}
          onClick={onClick}
          leading={leading}
          title={node.name}
          subtitle={recentDescription(item.recent)}
          trailing={active && <span className="text-2xs text-ink-3">{t('palette.again')}</span>}
        />
      </div>
    );
  }

  const { hit } = item;
  const trail = hit.breadcrumb
    .slice(0, -1)
    .map((crumb) => crumb.name)
    .join(' › ');
  const hint = hit.action
    ? suggestedLabel(t, hit)
    : isExecutable(node.kind)
      ? (() => {
          const primary = primaryAction({ node, pathInfo });
          return primary ? t(`actions.run.${primary.label}`) : t(`kinds.one.${node.kind}`);
        })()
      : t('palette.go');

  return (
    <div data-palette-key={item.key}>
      <Row
        id={id}
        active={active}
        onHover={onHover}
        onClick={onClick}
        leading={leading}
        title={<Highlighted text={node.name} ranges={hit.highlights} />}
        subtitle={trail || t(`kinds.one.${node.kind}`)}
        trailing={
          <span
            className={cn(
              'text-2xs max-w-[45%] shrink-0 truncate rounded-sm px-1.5 py-0.5',
              hit.action ? 'bg-accent-soft text-accent font-semibold' : 'text-ink-3',
              !hit.action && !active && 'invisible',
            )}
          >
            {hint}
          </span>
        }
      />
    </div>
  );
}

function suggestedLabel(t: ReturnType<typeof useTranslation>['t'], hit: SearchHit) {
  const action = hit.action as SuggestedAction;
  const tool = action.toolName;
  const label =
    action.actionId === 'terminal'
      ? tool
        ? t('actions.run.terminalTool', { tool })
        : t('actions.run.terminal')
      : action.actionId === 'open_with'
        ? tool
          ? t('actions.run.openInIdeTool', { tool })
          : t('actions.run.openInIde')
        : action.actionId === 'reveal'
          ? t('actions.run.reveal')
          : t('actions.run.openRemote');
  return action.target.id === hit.node.id ? label : `${label} · ${action.target.name}`;
}

function Highlighted({ text, ranges }: { text: string; ranges: [number, number][] }) {
  if (ranges.length === 0) return <>{text}</>;
  const characters = [...text];
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue;
    if (start > cursor) parts.push(characters.slice(cursor, start).join(''));
    parts.push(
      <mark
        key={start}
        className="text-ink bg-transparent font-semibold underline decoration-[var(--ld-accent)] decoration-2 underline-offset-2"
      >
        {characters.slice(start, end).join('')}
      </mark>,
    );
    cursor = end;
  }
  if (cursor < characters.length) parts.push(characters.slice(cursor).join(''));
  return <>{parts}</>;
}
