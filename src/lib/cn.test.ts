import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('risolve i conflitti Tailwind facendo vincere l ultima classe', () => {
    expect(cn('rounded-xl', 'rounded-3xl')).toBe('rounded-3xl');
  });

  it('ignora i valori falsy', () => {
    expect(cn('flex', false, undefined, null, 'gap-2')).toBe('flex gap-2');
  });
});
