/* Frecce fra le righe e le schede di una pagina, anche su due colonne: si
   sceglie l'elemento piu' vicino nella direzione del tasto, guardando dove
   sta sullo schermo e non l'ordine del DOM. */

export const NAV_ATTRIBUTE = 'data-row-nav';

type Direction = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const center = (box: Box) => ({ x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 });

/** L'indice del candidato piu' vicino a `from` nella direzione, o -1. */
export function nearestInDirection(from: Box, candidates: Box[], direction: Direction): number {
  const origin = center(from);
  let best = -1;
  let bestScore = Infinity;
  candidates.forEach((box, index) => {
    const point = center(box);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const ahead =
      direction === 'ArrowDown'
        ? box.top >= from.bottom - 2
        : direction === 'ArrowUp'
          ? box.bottom <= from.top + 2
          : direction === 'ArrowRight'
            ? box.left >= from.right - 2 && Math.abs(dy) < (from.bottom - from.top) / 2
            : box.right <= from.left + 2 && Math.abs(dy) < (from.bottom - from.top) / 2;
    if (!ahead) return;
    // Lungo l'asse del tasto conta la distanza, di traverso pesa di piu'.
    const vertical = direction === 'ArrowDown' || direction === 'ArrowUp';
    const score = vertical ? Math.abs(dy) + Math.abs(dx) * 2 : Math.abs(dx) + Math.abs(dy) * 2;
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

/** Sposta il fuoco dalla riga `current` alla piu' vicina nella direzione. */
export function moveRowFocus(current: HTMLElement, key: string): boolean {
  if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) return false;
  const elements = [...document.querySelectorAll<HTMLElement>(`[${NAV_ATTRIBUTE}]`)].filter(
    (element) => element !== current && element.offsetParent !== null,
  );
  const index = nearestInDirection(
    current.getBoundingClientRect(),
    elements.map((element) => element.getBoundingClientRect()),
    key as Direction,
  );
  if (index < 0) return false;
  const target = elements[index] as HTMLElement;
  target.focus();
  target.scrollIntoView({ block: 'nearest' });
  return true;
}
