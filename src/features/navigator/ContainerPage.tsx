import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Copy, FolderPlus, Layers, Plus, Rocket, Trash2 } from 'lucide-react';
import { Button, EmptyState, GlassPanel, PromptDialog, Spinner } from '@/components/ui';
import { cn } from '@/lib/cn';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { useDataStore } from '@/stores/dataStore';
import { useOpenStore } from '@/features/danger-zone/openStore';
import { DangerLevelPicker } from '@/features/danger-zone/DangerLevelPicker';
import { ApplicationCard } from '@/features/applications/ApplicationCard';
import { ApplicationEditor } from '@/features/applications/ApplicationEditor';
import { ApplicationCreateDialog } from '@/features/applications/ApplicationCreateDialog';
import { NotePanel } from '@/features/notes/NotePanel';
import { TagInput } from '@/features/tags/TagInput';
import { Breadcrumb } from './Breadcrumb';
import { DeleteContainerDialog } from './DeleteContainerDialog';
import { CHILD_KINDS } from './hierarchy';
import type { ApplicationWithLinks, ContainerKind, DangerLevel } from '@/types/domain';
import { INHERIT } from '@/types/domain';

type Dialog = { kind: 'child'; childKind: ContainerKind } | { kind: 'duplicate' } | null;

/** Due liste contengono gli stessi id? Se no, l'ordine locale è obsoleto. */
function sameMembers(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((id) => set.has(id));
}

/** La pagina di un nodo: figli, applicazioni, azioni sul ramo. */
export function ContainerPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const view = useDataStore((state) => state.view);
  const health = useDataStore((state) => state.health);
  const isLoading = useDataStore((state) => state.isLoading);
  const loadView = useDataStore((state) => state.loadView);
  const createContainer = useDataStore((state) => state.createContainer);
  const updateContainer = useDataStore((state) => state.updateContainer);
  const duplicateContainer = useDataStore((state) => state.duplicateContainer);
  const deleteContainer = useDataStore((state) => state.deleteContainer);
  const reorderApplications = useDataStore((state) => state.reorderApplications);

  const requestOpenMany = useOpenStore((state) => state.requestOpenMany);
  const requestOpen = useOpenStore((state) => state.requestOpen);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [newApplicationOpen, setNewApplicationOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // L'ordine locale esiste solo fra il rilascio del drag e la ricarica dei
  // dati: appena il database conferma, torna a comandare lui.
  const [draggedOrder, setDraggedOrder] = useState<string[] | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    if (id) void loadView(id);
  }, [id, loadView]);

  const order = useMemo(() => {
    const persisted = view?.applications.map((application) => application.id) ?? [];
    return draggedOrder && sameMembers(draggedOrder, persisted) ? draggedOrder : persisted;
  }, [view, draggedOrder]);

  const applications = useMemo(() => {
    if (!view) return [];
    const byId = new Map(view.applications.map((application) => [application.id, application]));
    return order
      .map((applicationId) => byId.get(applicationId))
      .filter((application): application is ApplicationWithLinks => !!application);
  }, [view, order]);

  // L'editor lavora sempre sull'oggetto ricaricato, mai su una copia stantia:
  // ogni modifica ricarica la vista e l'editor deve seguirla.
  const editing = applications.find((application) => application.id === editingId) ?? null;

  const allLinkIds = useMemo(
    () => applications.flatMap((application) => application.links.map((link) => link.id)),
    [applications],
  );

  if (!view) {
    return (
      <div className="flex h-64 items-center justify-center">
        {isLoading ? <Spinner size={24} className="text-zinc-400" /> : null}
      </div>
    );
  }

  const { container, danger } = view;
  const childKinds = CHILD_KINDS[container.kind];

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;

    // Riordino ottimistico: la persistenza avviene in background, perché qui
    // l'attesa si vedrebbe e romperebbe la sensazione fisica del trascinamento.
    const next = arrayMove(order, from, to);
    setDraggedOrder(next);
    void reorderApplications(container.id, next, String(active.id));
  };

  const inherited = {
    level: danger.level as DangerLevel,
    from: danger.inheritedFromName,
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-5 py-4"
    >
      <motion.div variants={staggerItem}>
        <Breadcrumb
          crumbs={view.breadcrumb}
          danger={danger}
          currentId={container.id}
          siblingEnvironments={view.siblingEnvironments}
        />
      </motion.div>

      {/* Barra azioni */}
      <motion.div variants={staggerItem} className="flex flex-wrap items-center gap-2">
        {allLinkIds.length > 0 && (
          <Button variant="accent" onClick={() => void requestOpenMany(allLinkIds)}>
            <Rocket strokeWidth={1.75} className="size-4" />
            {t('common.openAll')} ({allLinkIds.length})
          </Button>
        )}
        <Button onClick={() => setNewApplicationOpen(true)}>
          <Plus strokeWidth={1.75} className="size-4" />
          {t('navigator.addApplication')}
        </Button>
        {childKinds.map((childKind) => (
          <Button
            key={childKind}
            variant="ghost"
            onClick={() => setDialog({ kind: 'child', childKind })}
          >
            <FolderPlus strokeWidth={1.75} className="size-4" />
            {t(`navigator.new.${childKind}`)}
          </Button>
        ))}
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            title={t('common.duplicate')}
            onClick={() => setDialog({ kind: 'duplicate' })}
          >
            <Copy strokeWidth={1.75} className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title={t('common.delete')}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 strokeWidth={1.75} className="size-4" />
          </Button>
        </div>
      </motion.div>

      {/* Tag e nota del ramo */}
      <motion.div variants={staggerItem} className="flex flex-col gap-3">
        <TagInput entityType="container" entityId={container.id} />
        <NotePanel entityType="container" entityId={container.id} />
      </motion.div>

      {/* Protezione del ramo */}
      <motion.div variants={staggerItem}>
        <GlassPanel radius="2xl" className="p-4">
          <DangerLevelPicker
            value={container.dangerLevel}
            onChange={(level) =>
              void updateContainer(container.id, { dangerLevel: level ?? INHERIT })
            }
            inheritedLabel={danger.isOwn ? undefined : (danger.inheritedFromName ?? undefined)}
          />
        </GlassPanel>
      </motion.div>

      {/* Figli */}
      {view.children.length > 0 && (
        <motion.div variants={staggerItem} className="flex flex-wrap gap-2">
          {view.children.map((child) => (
            <button
              key={child.id}
              type="button"
              onClick={() => navigate(`/c/${child.id}`)}
              className={cn(
                'glass-panel-subtle glass-hairline flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium',
                'transition-transform duration-200 hover:-translate-y-0.5',
                child.dangerLevel === 'critical' && 'border-red-500/25',
              )}
            >
              {child.icon && <span>{child.icon}</span>}
              <span>{child.name}</span>
              <span className="text-[0.6875rem] text-zinc-400">{t(`kinds.${child.kind}`)}</span>
            </button>
          ))}
        </motion.div>
      )}

      {/* Applicazioni */}
      {applications.length === 0 ? (
        <motion.div variants={staggerItem}>
          <EmptyState
            icon={<Layers strokeWidth={1.5} className="size-7" />}
            title={t('navigator.noApplications')}
            description={t('navigator.noApplicationsHint')}
            actions={
              <Button variant="accent" onClick={() => setNewApplicationOpen(true)}>
                <Plus strokeWidth={1.75} className="size-4" />
                {t('navigator.addApplication')}
              </Button>
            }
          />
        </motion.div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 gap-2.5 xl:grid-cols-2"
            >
              {applications.map((application) => (
                <ApplicationCard
                  key={application.id}
                  application={application}
                  health={health}
                  inheritedLevel={inherited}
                  onOpen={(linkId) => void requestOpen(linkId)}
                  onEdit={(application) => setEditingId(application.id)}
                />
              ))}
            </motion.div>
          </SortableContext>
        </DndContext>
      )}

      {/* Dialoghi */}
      <ApplicationCreateDialog
        open={newApplicationOpen}
        containerId={container.id}
        onClose={() => setNewApplicationOpen(false)}
      />

      <PromptDialog
        open={dialog?.kind === 'child'}
        title={dialog?.kind === 'child' ? t(`navigator.new.${dialog.childKind}`) : ''}
        label={t('editor.name')}
        warn={(value) =>
          view.children.some((child) => child.name.toLowerCase() === value.toLowerCase())
            ? t('navigator.duplicateName')
            : null
        }
        onCancel={() => setDialog(null)}
        onConfirm={(name) => {
          if (dialog?.kind === 'child') {
            void createContainer(container.id, dialog.childKind, name);
          }
          setDialog(null);
        }}
      />

      <PromptDialog
        open={dialog?.kind === 'duplicate'}
        title={t('common.duplicate')}
        label={t('editor.name')}
        initialValue={`${container.name} ${t('common.copySuffix')}`}
        onCancel={() => setDialog(null)}
        onConfirm={(name) => {
          void duplicateContainer(container.id, name);
          setDialog(null);
        }}
      />

      <ApplicationEditor application={editing} onClose={() => setEditingId(null)} />

      <DeleteContainerDialog
        container={confirmingDelete ? container : null}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          setConfirmingDelete(false);
          void deleteContainer(container.id);
          // Risaliamo al padre invece che alla dashboard: dopo aver eliminato
          // un ambiente ci si aspetta di restare nel progetto.
          const parent = view.breadcrumb.at(-2);
          navigate(parent ? `/c/${parent.id}` : '/');
        }}
      />
    </motion.div>
  );
}
