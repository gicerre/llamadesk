import { describe, expect, it } from 'vitest';
import { resolveLanguage, SUPPORTED_LANGUAGES } from './i18n';

describe('resolveLanguage', () => {
  it('riconosce le lingue supportate dal locale di sistema', () => {
    expect(resolveLanguage('it-IT')).toBe('it');
    expect(resolveLanguage('en-US')).toBe('en');
    expect(resolveLanguage('IT')).toBe('it');
  });

  it('ricade sull inglese per lingue non supportate o valori vuoti', () => {
    expect(resolveLanguage('de-DE')).toBe('en');
    expect(resolveLanguage('')).toBe('en');
    expect(resolveLanguage(null)).toBe('en');
    expect(resolveLanguage(undefined)).toBe('en');
  });

  it('espone esattamente le lingue dichiarate nel progetto', () => {
    expect([...SUPPORTED_LANGUAGES]).toEqual(['en', 'it']);
  });
});
