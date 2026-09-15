import geometry from './geometry.json';

/* Forme del simbolo, lette da `geometry.json` (la stessa fonte delle icone). */

export type Part = 'neck' | 'head' | 'ear' | 'ears' | 'desk';

export interface Shape {
  part: Part;
  tone: 'ink' | 'brand';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Raggi per angolo: alto-sinistra, alto-destra, basso-destra, basso-sinistra. */
  r: [number, number, number, number];
  /** Solo "ears" della versione piccola: la tacca a V fra le orecchie. */
  notch?: number;
}

export const BRAND = geometry;
export const REGULAR = geometry.regular as Shape[];
export const SMALL = geometry.small as Shape[];

/** Fino a questa dimensione (px) si usa la versione con le orecchie unite. */
export const SMALL_BELOW = 32;

/** Rettangolo con raggi per angolo e, se richiesto, la tacca a V al centro del lato alto. */
export function shapePath({ x, y, w, h, r, notch }: Shape): string {
  const [tl, tr, br, bl] = r;
  const right = x + w;
  const bottom = y + h;
  const top = notch
    ? `H${x + w / 2 - notch * 0.6}L${x + w / 2} ${y + notch}L${x + w / 2 + notch * 0.6} ${y}`
    : '';
  const corner = (radius: number, toX: number, toY: number) =>
    radius > 0 ? `A${radius} ${radius} 0 0 1 ${toX} ${toY}` : `L${toX} ${toY}`;
  return [
    `M${x + tl} ${y}`,
    top,
    `H${right - tr}`,
    corner(tr, right, y + tr),
    `V${bottom - br}`,
    corner(br, right - br, bottom),
    `H${x + bl}`,
    corner(bl, x, bottom - bl),
    `V${y + tl}`,
    corner(tl, x + tl, y),
    'Z',
  ].join('');
}
