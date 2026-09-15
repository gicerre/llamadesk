import { describe, expect, it } from 'vitest';
import { nearestInDirection } from './focusNavigation';

// Due colonne di righe alte 48: [a b] / [c d]
const box = (left: number, top: number) => ({ left, top, right: left + 300, bottom: top + 48 });
const a = box(0, 0);
const b = box(310, 0);
const c = box(0, 56);
const d = box(310, 56);

describe('nearestInDirection', () => {
  it('moves across a two-column grid', () => {
    const others = [b, c, d];
    expect(nearestInDirection(a, others, 'ArrowRight')).toBe(0);
    expect(nearestInDirection(a, others, 'ArrowDown')).toBe(1);
    expect(nearestInDirection(d, [a, b, c], 'ArrowUp')).toBe(1);
    expect(nearestInDirection(d, [a, b, c], 'ArrowLeft')).toBe(2);
  });

  it('stays put at the edges', () => {
    expect(nearestInDirection(a, [b, c, d], 'ArrowUp')).toBe(-1);
    expect(nearestInDirection(b, [a, c, d], 'ArrowRight')).toBe(-1);
  });
});
