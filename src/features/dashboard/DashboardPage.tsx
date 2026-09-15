import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove } from '@dnd-kit/sortable';
import { Check, FolderPlus, LayoutDashboard, MoonStar, Plus, Settings2 } from 'lucide-react';
import { Button, EmptyState, GlassPanel, PromptDialog } from '@/components/ui';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { useActiveProfile, useSessionStore } from '@/stores/sessionStore';
import { useDataStore } from '@/stores/dataStore';
import { useOpenStore } from '@/features/danger-zone/openStore';
import { useDashboardWidgets } from './useDashboardWidgets';
import { WidgetCard } from './WidgetCard';
import { WidgetContent } from './widgets/WidgetContent';
import { WIDGET_KINDS, widgetLimit } from './widgetKinds';

/**
 * Durante il trascinamento i widget restano fermi: hanno altezze e larghezze
 * diverse, e farli scorrere l'uno sull'altro li deformerebbe. Si evidenzia il
 * punto di arrivo e al rilascio la griglia si ricompone.
 */
const staticStrategy = () => null;

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useActiveProfile();
  const profileId = useSessionStore((state) => state.activeProfileId);

  const containers = useDataStore((state) => state.containers);
  const health = useDataStore((state) => state.health);
  const loadHealth = useDataStore((state) => state.loadHealth);
  const createContainer = useDataStore((state) => state.createContainer);
  const setOnOpened = useOpenStore((state) => state.setOnOpened);

  const { widgets, move, hide, show, configure } = useDashboardWidgets(profileId);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // Cresce a ogni link aperto: i widget che dipendono dall'uso si ricaricano.
  const [version, setVersion] = useState(0);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    void loadHealth();
  }, [profileId, version, loadHealth]);

  // Aprire un link deve aggiornare i "Recenti" senza che l'utente ricarichi nulla.
  useEffect(() => {
    setOnOpened(() => setVersion((current) => current + 1));
    return () => setOnOpened(null);
  }, [setOnOpened]);

  const visible = widgets.filter((widget) => widget.isVisible);
  const hidden = widgets.filter((widget) => !widget.isVisible);
  const dragging = widgets.find((widget) => widget.id === draggingId) ?? null;
  const DraggingIcon = dragging ? WIDGET_KINDS[dragging.kind].icon : null;

  const dormant = Object.values(health).filter((usage) => usage.staleness === 'dormant');
  // Le applicazioni vivono dentro un contenitore: senza contenitori è tutto vuoto.
  const isEmpty = containers.length === 0;

  const header = (
    <motion.header variants={staggerItem} className="flex items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t('dashboard.title')}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t('dashboard.greeting')}
          {profile ? ` — ${profile.name}` : ''}
        </p>
      </div>

      {!isEmpty && widgets.length > 0 && (
        <Button
          variant={editing ? 'primary' : 'ghost'}
          size="sm"
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? (
            <Check strokeWidth={2} className="size-3.5" />
          ) : (
            <Settings2 strokeWidth={1.75} className="size-3.5" />
          )}
          {editing ? t('dashboard.done') : t('dashboard.customise')}
        </Button>
      )}
    </motion.header>
  );

  if (isEmpty) {
    return (
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-8 py-6"
      >
        {header}

        <motion.div variants={staggerItem}>
          <EmptyState
            icon={<LayoutDashboard strokeWidth={1.5} className="size-7" />}
            title={t('dashboard.empty.title')}
            description={t('dashboard.empty.description')}
            actions={
              <Button variant="accent" size="lg" onClick={() => setCreating(true)}>
                <FolderPlus strokeWidth={1.75} className="size-4" />
                {t('dashboard.empty.createProject')}
              </Button>
            }
          />
        </motion.div>

        <PromptDialog
          open={creating}
          title={t('navigator.new.project')}
          label={t('editor.name')}
          onCancel={() => setCreating(false)}
          onConfirm={(name) => {
            setCreating(false);
            void createContainer(null, 'project', name).then((created) => {
              if (created) navigate(`/c/${created.id}`);
            });
          }}
        />
      </motion.div>
    );
  }

  const handleDragStart = (event: DragStartEvent) => setDraggingId(String(event.active.id));

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const order = visible.map((widget) => widget.id);
    const from = order.indexOf(String(active.id));
    const to = order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;

    // Una sola posizione da scrivere: quella del widget spostato fra i suoi
    // nuovi vicini visibili.
    const next = arrayMove(order, from, to);
    move(String(active.id), next[to - 1] ?? null, next[to + 1] ?? null);
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-6 py-6"
    >
      {header}

      {visible.length === 0 && !editing && widgets.length > 0 && (
        <motion.div variants={staggerItem}>
          <EmptyState
            icon={<LayoutDashboard strokeWidth={1.5} className="size-7" />}
            title={t('dashboard.allHidden')}
            description={t('dashboard.allHiddenHint')}
            actions={
              <Button variant="primary" onClick={() => setEditing(true)}>
                <Settings2 strokeWidth={1.75} className="size-4" />
                {t('dashboard.customise')}
              </Button>
            }
          />
        </motion.div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggingId(null)}
      >
        <SortableContext items={visible.map((widget) => widget.id)} strategy={staticStrategy}>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {profileId &&
              visible.map((widget) => (
                <WidgetCard
                  key={widget.id}
                  widget={widget}
                  editing={editing}
                  onHide={() => hide(widget.id)}
                  onConfigure={(config) => configure(widget.id, config)}
                >
                  <WidgetContent
                    kind={widget.kind}
                    profileId={profileId}
                    limit={widgetLimit(widget)}
                    version={version}
                  />
                </WidgetCard>
              ))}

            {/* Health check: solo cronologia locale, nessuna richiesta di rete.
                Compare solo quando c'è qualcosa da dire, quindi non è un widget. */}
            {!editing && dormant.length > 0 && (
              <motion.section variants={staggerItem}>
                <GlassPanel radius="3xl" className="flex flex-col gap-3 p-5">
                  <header className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
                    <MoonStar strokeWidth={1.75} className="size-4" />
                    <h2 className="text-xs font-semibold tracking-wide uppercase">
                      {t('health.title')}
                    </h2>
                  </header>
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    {t('health.summary', { count: dormant.length })}
                  </p>
                  <p className="text-xs text-zinc-400 dark:text-zinc-600">
                    {t('health.dormantHint')}
                  </p>
                </GlassPanel>
              </motion.section>
            )}
          </div>
        </SortableContext>

        {/* Nel body: un antenato con `backdrop-filter` sposterebbe l'anteprima. */}
        {createPortal(
          <DragOverlay dropAnimation={null}>
            {dragging && (
              <div className="glass-popover flex w-max items-center gap-2 rounded-2xl px-4 py-2.5 text-zinc-600 shadow-lg dark:text-zinc-300">
                {DraggingIcon && <DraggingIcon strokeWidth={1.75} className="size-4" />}
                <span className="text-xs font-semibold tracking-wide uppercase">
                  {t(WIDGET_KINDS[dragging.kind].titleKey)}
                </span>
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>

      {/* Aggiungere un widget = rimetterlo in vista: ognuno esiste una volta. */}
      {editing && hidden.length > 0 && (
        <motion.section variants={staggerItem} className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
            {t('dashboard.hiddenTitle')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {hidden.map((widget) => {
              const Icon = WIDGET_KINDS[widget.kind].icon;
              return (
                <button
                  key={widget.id}
                  type="button"
                  onClick={() => show(widget.id)}
                  title={t('dashboard.show')}
                  className="flex items-center gap-2 rounded-xl border border-dashed border-black/15 px-3 py-2 text-sm text-zinc-600 transition-colors hover:border-black/30 hover:bg-black/[0.04] dark:border-white/15 dark:text-zinc-300 dark:hover:border-white/30 dark:hover:bg-white/[0.06]"
                >
                  <Plus strokeWidth={2} className="size-3.5" />
                  <Icon strokeWidth={1.75} className="size-4" />
                  {t(WIDGET_KINDS[widget.kind].titleKey)}
                </button>
              );
            })}
          </div>
        </motion.section>
      )}
    </motion.div>
  );
}
