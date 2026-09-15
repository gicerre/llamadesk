import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronRight, CircleAlert, Hash, Plus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { NodeIcon } from '@/components/NodeIcon';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { Tip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import i18n from '@/lib/i18n';
import { api } from '@/lib/ipc';
import { canPickPaths, pickPaths } from '@/lib/pickers';
import { invalidateLibrary, useChildren, usePathInfos } from '@/lib/queries';
import { routeForChain } from '@/lib/routes';
import { useDialogs } from '@/stores/dialogs';
import { useInspector } from '@/stores/inspector';
import { toastError } from '@/stores/toasts';
import type { Crumb } from '@/types/generated/Crumb';
import type { NodeEntry } from '@/types/generated/NodeEntry';
import type { NodeKind } from '@/types/generated/NodeKind';
import type { NodeView } from '@/types/generated/NodeView';
import type { PathInfo } from '@/types/generated/PathInfo';
import { ResourceRow } from '../resources/ResourceRow';
import { rowGrid, SectionTitle } from '../library/parts';
import { useFileDropTarget } from '../resources/fileDrop';

interface ScopeContentProps {
  view: NodeView;
  workspaceId: string;
  /** Tipi di figli da non mostrare (la Home disegna i progetti a parte). */
  exclude?: readonly NodeKind[];
}

const RESOURCE_KINDS = new Set<NodeKind>(['link', 'link_group', 'path']);

/** Dati attaccati a ogni elemento trascinabile e a ogni bersaglio. */
interface DragData {
  parentId: string;
  entry?: NodeEntry;
}

/**
 * Il contenuto di un ambito (progetto, sottoprogetto, sezione a fuoco,
 * workspace): risorse senza sezione, poi le sezioni figlie aperte. Le sezioni
 * piu' profonde sono righe che aprono la vista a fuoco: mai piu' di un livello
 * di sezioni visibile insieme (D4).
 *
 * Le righe si trascinano per riordinarle o spostarle in un'altra sezione
 * (anche sul titolo di una sezione), e da tastiera con Alt+↑/↓.
 */
export function ScopeContent({ view, workspaceId, exclude = [] }: ScopeContentProps) {
  const { t } = useTranslation();
  const openCreate = useDialogs((state) => state.openCreate);
  const openAdd = useDialogs((state) => state.openAdd);
  const [dragging, setDragging] = useState<NodeEntry | null>(null);
  const { node, breadcrumb } = view;

  const children = view.children.filter((entry) => !exclude.includes(entry.node.kind));
  const subprojects = children.filter((entry) => entry.node.kind === 'subproject');
  const resources = children.filter((entry) => RESOURCE_KINDS.has(entry.node.kind));
  const sections = children.filter((entry) => entry.node.kind === 'section');
  const pathInfos = usePathInfos(paths(resources));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const drop = useFileDropTarget(node.id);

  const onDragStart = (event: DragStartEvent) =>
    setDragging((event.active.data.current as DragData | undefined)?.entry ?? null);

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = active.data.current as (DragData & SortableData) | undefined;
    const target = over.data.current as (DragData & Partial<SortableData>) | undefined;
    if (!from || !target) return;

    // Sul titolo di una sezione: in coda a quella sezione.
    if (!target.sortable) {
      void move(String(active.id), from.parentId, target.parentId, null, null);
      return;
    }

    // Su una riga: al suo posto, nell'elenco a cui appartiene.
    const list = target.sortable.items.map(String).filter((id) => id !== active.id);
    const overIndex = list.indexOf(String(over.id));
    const sameList = from.parentId === target.parentId;
    // Nello stesso elenco, trascinando verso il basso si finisce dopo il bersaglio.
    const index =
      sameList && from.sortable.index < target.sortable.index ? overIndex + 1 : overIndex;
    void move(
      String(active.id),
      from.parentId,
      target.parentId,
      list[index - 1] ?? null,
      list[index] ?? null,
    );
  };

  if (children.length === 0) {
    return (
      <div
        {...drop.targetProps}
        className={cn('rounded-lg', drop.active && 'shadow-[0_0_0_2px_var(--ld-accent)]')}
      >
        <EmptyState
          className="mt-2"
          icon={<Hash />}
          title={t('scope.emptyTitle')}
          description={t('scope.emptyDescription')}
          actions={
            <>
              <Button variant="primary" onClick={() => openAdd({ parentId: node.id, workspaceId })}>
                <Plus />
                {t('add.title')}
              </Button>
              {node.kind === 'project' && (
                <Button
                  onClick={() => openCreate({ kind: 'subproject', parentId: node.id, workspaceId })}
                >
                  {t('create.title.subproject')}
                </Button>
              )}
            </>
          }
        />
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div className="flex flex-col gap-7">
        {subprojects.length > 0 && (
          <section>
            <SectionTitle count={subprojects.length}>{t('scope.subprojects')}</SectionTitle>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {subprojects.map((entry) => (
                <SubprojectCard
                  key={entry.node.id}
                  entry={entry}
                  chain={breadcrumb}
                  workspaceId={workspaceId}
                />
              ))}
            </div>
          </section>
        )}

        <div
          {...drop.targetProps}
          className={cn(
            'rounded-lg transition-shadow duration-120',
            drop.active && 'shadow-[0_0_0_2px_var(--ld-accent)]',
          )}
        >
          <SortableList
            parentId={node.id}
            entries={resources}
            chain={breadcrumb}
            workspaceId={workspaceId}
            pathInfos={pathInfos.data}
          />
          {resources.length === 0 && (
            <AddStrip onAdd={() => openAdd({ parentId: node.id, workspaceId })} />
          )}
        </div>

        {sections.map((entry) => (
          <SectionBlock
            key={entry.node.id}
            entry={entry}
            chain={breadcrumb}
            workspaceId={workspaceId}
          />
        ))}
      </div>

      {createPortal(
        <DragOverlay dropAnimation={null}>
          {dragging && <ResourceRow entry={dragging} className="shadow-3! w-[min(420px,40vw)]" />}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

function paths(entries: readonly NodeEntry[]): string[] {
  return entries.flatMap((entry) =>
    entry.node.kind === 'path' && entry.node.path ? [entry.node.path] : [],
  );
}

/** Cio' che dnd-kit attacca a ogni elemento di una SortableContext. */
interface SortableData {
  sortable: { containerId: string; index: number; items: (string | number)[] };
}

async function move(
  id: string,
  fromParentId: string,
  toParentId: string,
  previousId: string | null,
  nextId: string | null,
) {
  try {
    await api.moveNode(id, fromParentId, toParentId, previousId, nextId);
  } catch (error) {
    toastError(i18n.t('resources.moveFailed'), error);
  } finally {
    await invalidateLibrary();
  }
}

interface SortableListProps {
  parentId: string;
  entries: readonly NodeEntry[];
  chain: Crumb[];
  workspaceId: string;
  pathInfos: Map<string, PathInfo> | undefined;
}

function SortableList({ parentId, entries, chain, workspaceId, pathInfos }: SortableListProps) {
  const ids = entries.map((entry) => entry.node.id);
  return (
    <SortableContext id={parentId} items={ids} strategy={rectSortingStrategy}>
      <div className={rowGrid}>
        {entries.map((entry, index) => (
          <SortableRow
            key={entry.node.id}
            entry={entry}
            parentId={parentId}
            chain={chain}
            workspaceId={workspaceId}
            pathInfo={entry.node.path ? pathInfos?.get(entry.node.path) : undefined}
            previousId={ids[index - 1] ?? null}
            beforePreviousId={ids[index - 2] ?? null}
            nextId={ids[index + 1] ?? null}
            afterNextId={ids[index + 2] ?? null}
          />
        ))}
      </div>
    </SortableContext>
  );
}

interface SortableRowProps {
  entry: NodeEntry;
  parentId: string;
  chain: Crumb[];
  workspaceId: string;
  pathInfo: PathInfo | undefined;
  previousId: string | null;
  beforePreviousId: string | null;
  nextId: string | null;
  afterNextId: string | null;
}

function SortableRow({
  entry,
  parentId,
  chain,
  workspaceId,
  pathInfo,
  previousId,
  beforePreviousId,
  nextId,
  afterNextId,
}: SortableRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const selectedId = useInspector((state) => state.nodeId);
  const openInspector = useInspector((state) => state.open);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.node.id,
    data: { parentId, entry } satisfies DragData,
  });

  const { node } = entry;
  const isSection = node.kind === 'section';

  const activate = () => {
    if (isSection) navigate(routeForChain(workspaceId, [...chain, node]));
    else openInspector(node.id, workspaceId);
  };

  const locate = async () => {
    const [path] = await pickPaths({ directory: !pathInfo?.extension, multiple: false });
    if (!path) return;
    try {
      await api.updateNode(node.id, { path });
      await invalidateLibrary();
    } catch (error) {
      toastError(t('resources.locateFailed'), error);
    }
  };

  const keyboard = (event: React.KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    } else if (event.altKey && event.key === 'ArrowUp' && previousId) {
      event.preventDefault();
      void move(node.id, parentId, parentId, beforePreviousId, previousId);
    } else if (event.altKey && event.key === 'ArrowDown' && nextId) {
      event.preventDefault();
      void move(node.id, parentId, parentId, nextId, afterNextId);
    }
  };

  const style = { transform: CSS.Translate.toString(transform), transition };

  if (isSection) {
    return (
      <div ref={setNodeRef} style={style} className={cn(isDragging && 'opacity-40')}>
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={activate}
          onKeyDown={keyboard}
          className="h-row bg-surface shadow-1 hover:shadow-2 flex w-full min-w-0 items-center gap-3 rounded-md px-2.5 text-left transition-shadow duration-120"
        >
          <span className="bg-hover flex size-8 shrink-0 items-center justify-center rounded-md">
            <NodeIcon
              kind="section"
              name={node.name}
              icon={node.icon}
              color={node.colorMain}
              size="sm"
            />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-ink block truncate text-sm font-semibold">{node.name}</span>
            <span className="text-2xs text-ink-3 block truncate">
              {t('kinds.one.section')} · {t('kinds.count.item', { count: entry.childCount })}
            </span>
          </span>
          <ChevronRight className="text-ink-3 size-4 shrink-0" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <ResourceRow
      ref={setNodeRef}
      style={style}
      entry={entry}
      pathInfo={pathInfo}
      selected={selectedId === node.id}
      onLocate={canPickPaths() ? () => void locate() : undefined}
      className={cn(isDragging && 'opacity-40')}
      {...attributes}
      {...listeners}
      onClick={activate}
      onKeyDown={keyboard}
      aria-label={`${node.name}, ${t(`kinds.one.${node.kind}`)}`}
      aria-roledescription={t('resources.draggable')}
    />
  );
}

function AddStrip({ onAdd }: { onAdd: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onAdd}
      className="h-row text-ink-3 hover:bg-hover hover:text-ink flex w-full items-center justify-center gap-2 rounded-md text-sm shadow-[inset_0_0_0_1px_var(--ld-line)] transition-colors duration-120"
    >
      <Plus className="size-4" aria-hidden />
      {t('add.hint')}
    </button>
  );
}

function SubprojectCard({
  entry,
  chain,
  workspaceId,
}: {
  entry: NodeEntry;
  chain: Crumb[];
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { node } = entry;
  return (
    <button
      type="button"
      onClick={() => navigate(routeForChain(workspaceId, [...chain, node]))}
      className="bg-surface shadow-1 hover:shadow-2 flex items-center gap-3 rounded-lg p-3 text-left transition-shadow duration-120"
    >
      <span className="bg-hover flex size-8 shrink-0 items-center justify-center rounded-md">
        <NodeIcon
          kind="subproject"
          name={node.name}
          icon={node.icon}
          color={node.colorMain}
          size="sm"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-sm font-semibold">{node.name}</span>
        <span className="text-ink-3 block truncate text-xs">
          {t('kinds.count.item', { count: entry.childCount })}
        </span>
      </span>
      <ChevronRight className="text-ink-3 size-4 shrink-0" aria-hidden />
    </button>
  );
}

/** Una sezione figlia: titolo che apre la vista a fuoco, poi il suo contenuto diretto. */
function SectionBlock({
  entry,
  chain,
  workspaceId,
}: {
  entry: NodeEntry;
  chain: Crumb[];
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openAdd = useDialogs((state) => state.openAdd);
  const { node } = entry;
  const children = useChildren(node.id, entry.childCount > 0);
  const sectionChain = [...chain, node];
  const items = children.data ?? [];
  const pathInfos = usePathInfos(paths(items));
  // Destrutturato: i lint del compilatore React trattano come ref l'intero oggetto.
  const { setNodeRef: setHeaderRef, isOver: headerIsOver } = useDroppable({
    id: `section:${node.id}`,
    data: { parentId: node.id } satisfies DragData,
  });
  const drop = useFileDropTarget(node.id);

  return (
    <section
      {...drop.targetProps}
      aria-label={node.name}
      className={cn(
        'rounded-lg transition-shadow duration-120',
        drop.active && 'shadow-[0_0_0_2px_var(--ld-accent)]',
      )}
    >
      <div
        ref={setHeaderRef}
        className={cn(
          'rounded-sm px-1 transition-colors duration-120',
          headerIsOver && 'bg-accent-soft',
        )}
      >
        <SectionTitle
          count={entry.childCount}
          actions={
            <>
              <Tip label={t('add.titleIn', { name: node.name })}>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={t('add.titleIn', { name: node.name })}
                  onClick={() => openAdd({ parentId: node.id, workspaceId })}
                >
                  <Plus />
                </Button>
              </Tip>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(routeForChain(workspaceId, sectionChain))}
              >
                {t('scope.focus')}
                <ChevronRight />
              </Button>
            </>
          }
        >
          <button
            type="button"
            onClick={() => navigate(routeForChain(workspaceId, sectionChain))}
            className="hover:text-ink flex items-center gap-1.5 uppercase"
          >
            {node.name}
            {node.caution && node.caution !== 'none' && (
              <span className="bg-danger-soft text-2xs text-danger flex items-center gap-1 rounded-full px-1.5 py-px font-medium tracking-normal normal-case">
                <CircleAlert className="size-3" aria-hidden />
                {t('states.caution')}
              </span>
            )}
          </button>
        </SectionTitle>
      </div>

      {entry.childCount === 0 ? (
        <AddStrip onAdd={() => openAdd({ parentId: node.id, workspaceId })} />
      ) : children.isLoading ? (
        <div className={rowGrid}>
          <Skeleton className="h-row" />
          <Skeleton className="h-row" />
        </div>
      ) : (
        <SortableList
          parentId={node.id}
          entries={items}
          chain={sectionChain}
          workspaceId={workspaceId}
          pathInfos={pathInfos.data}
        />
      )}
    </section>
  );
}
