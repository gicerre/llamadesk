import { describe, expect, it } from 'vitest';
import { COLOR_PRESETS, initials, normalizeHex, suggestColor } from './identity';

describe('initials', () => {
  it('usa le maiuscole interne di una parola composta', () => {
    expect(initials('SpecialHub')).toBe('SH');
  });

  it('usa le prime lettere di due parole', () => {
    expect(initials('Cliente Rossi')).toBe('CR');
    expect(initials('casa nuova al mare')).toBe('CN');
    expect(initials('specialhub-backend')).toBe('SB');
  });

  it('una parola sola da una lettera', () => {
    expect(initials('Lavoro')).toBe('L');
    expect(initials('ÉCOLE')).toBe('ÉC');
    expect(initials('   ')).toBe('?');
  });
});

describe('normalizeHex', () => {
  it('accetta forme corte, lunghe e senza cancelletto', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('3c62c4')).toBe('#3c62c4');
  });

  it('rifiuta tutto il resto', () => {
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });
});

describe('suggestColor', () => {
  it('propone il primo colore non ancora usato', () => {
    const [first, second] = COLOR_PRESETS;
    expect(suggestColor([])).toBe(first?.hex);
    expect(suggestColor([first?.hex.toLowerCase() ?? null])).toBe(second?.hex);
  });

  it('quando sono finiti ricomincia a rotazione', () => {
    const all = COLOR_PRESETS.map((preset) => preset.hex);
    expect(COLOR_PRESETS.map((preset) => preset.hex)).toContain(suggestColor(all));
  });
});
