import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useDataStore } from '@/stores/dataStore';
import { KIND_ICON } from './hierarchy';
import { NavigatorDndContext } from './useNavigatorDnd';
import { canNestUnder, canPlaceBeside, pickPosition, planMove, type DropTarget } from './treeDrop';

/** Quanto resta sopra un ramo chiuso prima che si apra da solo. */
const AUTO_EXPAND_MS = 600;

const sameTarget = (a: DropTarget | null, b: DropTarget | null) =>
  a?.id === b?.id && a?.position === b?.position;

/**
 * Drag & drop dell'albero della sidebar.
 *
 * Avvolge entrambi gli alberi (Progetti e Workspace) con un solo contesto,
 * perché un gruppo può passare legittimamente da un progetto a un workspace.
 * Per lo stesso motivo lo stato di espansione vive qui e non nel singolo
 * albero: dopo un rilascio "dentro" il ramo di destinazione deve aprirsi,
 * ovunque sia.
 *
 * Ogni riga ha tre fasce: bordo superiore = prima, centro = dentro, bordo
 * inferiore = dopo. Le regole (`treeDrop.ts`) spengono le fasce non ammesse,
 * così a schermo non si promette mai un rilascio che Rust rifiuterebbe.
 */
export function NavigatorDnd({ children }: { children: ReactNode }) {
  const containers = useDataStore((state) => state.containers);
  const moveContainer = useDataStore((state) => state.moveContainer);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [target, setTarget] = useState<DropTarget | null>(null);

  // Stessa soglia delle card: sotto i 5 px un gesto resta un click.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const pointerY = useRef(0);
  const swallowClick = useRef(false);

  const expand = useCallback(
    (id: string) =>
      setExpanded((current) => (current.has(id) ? current : new Set(current).add(id))),
    [],
  );

  const toggle = useCallback(
    (id: string) =>
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  const firstChild = useCallback(
    (id: string) => containers.find((node) => node.parentId === id),
    [containers],
  );

  // La posizione del puntatore la leggiamo noi, in cattura sulla finestra: il
  // `delta` di dnd-kit non tiene conto dello scorrimento della sidebar.
  useEffect(() => {
    if (!draggingId) return;
    const track = (event: PointerEvent) => {
      pointerY.current = event.clientY;
    };
    window.addEventListener('pointermove', track, { capture: true });
    return () => window.removeEventListener('pointermove', track, { capture: true });
  }, [draggingId]);

  // Fermarsi sopra un ramo chiuso lo apre, come in Esplora file.
  useEffect(() => {
    if (target?.position !== 'inside' || expanded.has(target.id) || !firstChild(target.id)) return;
    const timer = window.setTimeout(() => expand(target.id), AUTO_EXPAND_MS);
    return () => window.clearTimeout(timer);
  }, [target, expanded, expand, firstChild]);

  const resolveTarget = (draggedId: string, overId: string | null): DropTarget | null => {
    const dragged = containers.find((node) => node.id === draggedId);
    const over = containers.find((node) => node.id === overId);
    const row = overId ? document.querySelector(`[data-tree-row="${overId}"]`) : null;
    if (!dragged || !over || !row) return null;

    const rect = row.getBoundingClientRect();
    const ratio = rect.height > 0 ? (pointerY.current - rect.top) / rect.height : 0.5;

    const canInside = over.id !== dragged.id && canNestUnder(containers, dragged, over.id);
    const canBeside = canPlaceBeside(containers, dragged, over);
    const position = pickPosition(ratio, canInside, canBeside);
    if (!position) return null;

    let candidate: DropTarget = { id: over.id, position };

    // "Dopo" un ramo aperto, a schermo, è il punto sopra il suo primo figlio:
    // il nodo deve finire lì, non in fondo al ramo.
    const child = firstChild(over.id);
    if (position === 'after' && child && expanded.has(over.id)) {
      if (canPlaceBeside(containers, dragged, child))
        candidate = { id: child.id, position: 'before' };
      else if (canInside) candidate = { id: over.id, position: 'inside' };
      else return null;
    }

    return planMove(containers, dragged.id, candidate) ? candidate : null;
  };

  const handleDragStart = (event: DragStartEvent) => {
    const activator = event.activatorEvent;
    if (activator instanceof PointerEvent) pointerY.current = activator.clientY;
    setDraggingId(String(event.active.id));
  };

  const handleDragMove = (event: DragMoveEvent) => {
    const next = resolveTarget(String(event.active.id), event.over ? String(event.over.id) : null);
    setTarget((current) => (sameTarget(current, next) ? current : next));
  };

  const reset = () => {
    setDraggingId(null);
    setTarget(null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const draggedId = String(event.active.id);
    const plan = target ? planMove(containers, draggedId, target) : null;
    reset();

    // Il rilascio sulla riga di partenza produrrebbe anche un click: navigare
    // dopo aver trascinato sarebbe una sorpresa.
    swallowClick.current = true;
    window.setTimeout(() => {
      swallowClick.current = false;
    }, 0);

    if (!plan) return;
    if (plan.parentId) expand(plan.parentId);
    void moveContainer(draggedId, plan.parentId, plan.previousId, plan.nextId);
  };

  const guardClick = useCallback((event: MouseEvent) => {
    if (!swallowClick.current) return;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const value = useMemo(
    () => ({ expanded, toggle, draggingId, target, guardClick }),
    [expanded, toggle, draggingId, target, guardClick],
  );

  const dragged = draggingId ? containers.find((node) => node.id === draggingId) : null;

  return (
    <NavigatorDndContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={reset}
      >
        {children}

        {/* Nel body: la sidebar ha un `backdrop-filter`, che per un elemento
            `fixed` diventerebbe il riferimento e sposterebbe l'anteprima. */}
        {createPortal(
          <DragOverlay dropAnimation={null}>
            {dragged && (
              <div className="glass-popover flex w-max max-w-56 items-center gap-2 rounded-xl px-3 py-1.5 shadow-lg">
                <span className="text-xs">{dragged.icon ?? KIND_ICON[dragged.kind]}</span>
                <span className="truncate text-[0.8125rem] font-medium text-zinc-800 dark:text-zinc-100">
                  {dragged.name}
                </span>
              </div>
            )}
          </DragOverlay>,
          document.body,
        )}
      </DndContext>
    </NavigatorDndContext.Provider>
  );
}
