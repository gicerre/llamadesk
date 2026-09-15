import { describe, expect, it } from 'vitest';
import { fold, scoreText } from './fuzzy';

describe('scoreText', () => {
  it('ignores case and accents', () => {
    expect(fold('Attività')).toBe('attivita');
    expect(scoreText('attivita', 'Nuova attività')).toBeGreaterThan(0);
  });

  it('prefers prefixes and word starts', () => {
    const prefix = scoreText('imp', 'Impostazioni');
    const word = scoreText('tema', 'Cambia tema');
    const inside = scoreText('stazioni', 'Impostazioni');
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inside);
  });

  it('needs every word', () => {
    expect(scoreText('nuovo progetto', 'Nuovo progetto')).toBeCloseTo((1 + 0.85) / 2);
    expect(scoreText('nuovo zzz', 'Nuovo progetto')).toBe(0);
    expect(scoreText('', 'Nuovo progetto')).toBe(0);
  });
});
