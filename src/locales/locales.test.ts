import { describe, expect, it } from 'vitest';
import enMessages from './en.json';
import itMessages from './it.json';

/** Le due lingue devono restare allineate: una chiave mancante = testo mancante. */
function flatten(source: object, prefix = ''): string[] {
  return Object.entries(source).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? flatten(value as object, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('file di traduzione', () => {
  it('espongono esattamente le stesse chiavi', () => {
    expect(flatten(itMessages).sort()).toEqual(flatten(enMessages).sort());
  });

  it('non contengono stringhe vuote', () => {
    for (const source of [enMessages, itMessages]) {
      const empty = flatten(source).filter((key) => {
        const value = key
          .split('.')
          .reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], source);
        return typeof value === 'string' && value.trim().length === 0;
      });
      expect(empty).toEqual([]);
    }
  });
});
