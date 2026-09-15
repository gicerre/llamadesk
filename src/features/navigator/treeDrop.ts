import { CHILD_KINDS } from './hierarchy';
import type { Container } from '@/types/domain';

/**
 * Logica del drag & drop dell'albero, senza React.
 *
 * Decide dove può cadere un nodo e traduce il punto di rilascio negli
 * argomenti di `move_container` (nuovo padre + vicini). Le regole sono le
 * stesse che Rust applica comunque: qui servono a non promettere a schermo un
 * rilascio che il backend rifiuterebbe.
 */

/** Dove cade il nodo rispetto alla riga sotto il puntatore. */
export type DropPosition = 'before' | 'after' | 'inside';

export interface DropTarget {
  id: string;
  position: DropPosition;
}

/** Argomenti di `move_container`. */
export interface MovePlan {
  parentId: string | null;
  previousId: string | null;
  nextId: string | null;
}

const byId = (containers: Container[], id: string | null) =>
  id === null ? undefined : containers.find((node) => node.id === id);

/** Vero se `candidateId` è `ancestorId` oppure sta sotto di lui. */
function isWithin(containers: Container[], candidateId: string | null, ancestorId: string) {
  let current = byId(containers, candidateId);
  while (current) {
    if (current.id === ancestorId) return true;
    current = byId(containers, current.parentId);
  }
  return false;
}

/**
 * Vero se `dragged` può diventare figlio di `parentId` (`null` = radice):
 * niente cicli, e la coppia padre/figlio deve essere ammessa.
 */
export function canNestUnder(containers: Container[], dragged: Container, parentId: string | null) {
  if (parentId !== null && isWithin(containers, parentId, dragged.id)) return false;
  const parentKind = parentId === null ? 'root' : byId(containers, parentId)?.kind;
  return !!parentKind && CHILD_KINDS[parentKind].includes(dragged.kind);
}

/** Vero se `dragged` può stare accanto a `target`, come suo fratello. */
export function canPlaceBeside(containers: Container[], dragged: Container, target: Container) {
  // In radice progetti e workspace vivono in due alberi separati: un progetto
  // "accanto a un workspace" finirebbe in un punto che l'utente non vede.
  if (target.parentId === null && target.kind !== dragged.kind) return false;
  return canNestUnder(containers, dragged, target.parentId);
}

/**
 * Sceglie la posizione dalla quota del puntatore sulla riga (0 = bordo
 * superiore, 1 = inferiore). Con tutte e tre ammesse, le fasce esterne sono
 * "prima" e "dopo" e il centro è "dentro"; se una non è ammessa, le altre si
 * prendono il suo spazio. `null` = nessun rilascio possibile qui.
 */
export function pickPosition(
  ratio: number,
  canInside: boolean,
  canBeside: boolean,
): DropPosition | null {
  if (canInside && canBeside) {
    if (ratio < 0.25) return 'before';
    if (ratio > 0.75) return 'after';
    return 'inside';
  }
  if (canInside) return 'inside';
  if (canBeside) return ratio < 0.5 ? 'before' : 'after';
  return null;
}

/**
 * Traduce un rilascio negli argomenti di `move_container`.
 *
 * `null` se il rilascio non è valido oppure non cambierebbe niente (lo stesso
 * nodo rimesso fra gli stessi vicini): in entrambi i casi non si scrive.
 */
export function planMove(
  containers: Container[],
  draggedId: string,
  target: DropTarget,
): MovePlan | null {
  const dragged = byId(containers, draggedId);
  const over = byId(containers, target.id);
  if (!dragged || !over || dragged.id === over.id) return null;

  const parentId = target.position === 'inside' ? over.id : over.parentId;
  const valid =
    target.position === 'inside'
      ? canNestUnder(containers, dragged, over.id)
      : canPlaceBeside(containers, dragged, over);
  if (!valid) return null;

  // I fratelli nell'ordine dell'albero (quello di `list_containers`), senza il
  // nodo spostato: i vicini vanno cercati nella lista in cui atterra.
  const siblings = containers.filter(
    (node) => node.parentId === parentId && node.id !== dragged.id,
  );

  let index: number;
  if (target.position === 'inside') index = siblings.length;
  else {
    const at = siblings.findIndex((node) => node.id === over.id);
    index = target.position === 'before' ? at : at + 1;
  }

  const plan: MovePlan = {
    parentId,
    previousId: siblings[index - 1]?.id ?? null,
    nextId: siblings[index]?.id ?? null,
  };

  // Stesso padre e stessi vicini di adesso: il rilascio è un no-op.
  if (parentId === dragged.parentId) {
    const current = containers.filter((node) => node.parentId === parentId);
    const position = current.findIndex((node) => node.id === dragged.id);
    const unchanged =
      (current[position - 1]?.id ?? null) === plan.previousId &&
      (current[position + 1]?.id ?? null) === plan.nextId;
    if (unchanged) return null;
  }

  return plan;
}
