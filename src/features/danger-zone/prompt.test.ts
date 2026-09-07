import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import {
  fallbackPrompt,
  interpolate,
  LEVEL_SEVERITY,
  renderPrompt,
  requiresConfirmation,
} from './prompt';
import type { DangerPrompt } from '@/types/domain';

/** `t` finto: restituisce la chiave, così i test verificano quale chiave viene usata. */
const t = ((key: string) => `t:${key}`) as unknown as TFunction;

const placeholders = {
  environment: 'PRODUZIONE',
  application: 'Camunda',
  project: 'ACME',
};

const custom: DangerPrompt = {
  id: '1',
  profileId: null,
  name: 'Custom',
  level: 'critical',
  title: 'Attenzione a {environment}',
  message: 'Stai aprendo {application} su {environment} ({project})',
  confirmLabel: 'Vai',
  cancelLabel: 'Ferma',
  confirmWord: 'CONFERMO',
  isBuiltin: false,
};

describe('interpolate', () => {
  it('sostituisce i segnaposto noti', () => {
    expect(interpolate('{application} su {environment}', placeholders)).toBe(
      'Camunda su PRODUZIONE',
    );
  });

  it('lascia visibili i segnaposto sconosciuti invece di svuotarli', () => {
    expect(interpolate('per {cliente}', placeholders)).toBe('per {cliente}');
  });

  it('non tocca un testo senza segnaposto', () => {
    expect(interpolate('nessun segnaposto', placeholders)).toBe('nessun segnaposto');
  });
});

describe('renderPrompt', () => {
  it('usa il testo letterale dei prompt personalizzati', () => {
    const rendered = renderPrompt(custom, placeholders, t);
    expect(rendered.title).toBe('Attenzione a PRODUZIONE');
    expect(rendered.message).toBe('Stai aprendo Camunda su PRODUZIONE (ACME)');
    expect(rendered.confirmLabel).toBe('Vai');
    expect(rendered.confirmWord).toBe('CONFERMO');
  });

  it('traduce i prompt built-in, che contengono chiavi i18n', () => {
    const builtin: DangerPrompt = {
      ...custom,
      isBuiltin: true,
      title: 'danger.builtin.critical.title',
      message: 'danger.builtin.critical.message',
      confirmLabel: 'danger.builtin.critical.confirm',
      cancelLabel: 'danger.builtin.critical.cancel',
    };

    const rendered = renderPrompt(builtin, placeholders, t);
    expect(rendered.title).toBe('t:danger.builtin.critical.title');
    // La parola di conferma dei built-in va tradotta: nessun italiano deve
    // digitare "PROCEED".
    expect(rendered.confirmWord).toBe('t:danger.confirmWord');
  });

  it('non chiede alcuna parola sotto il livello critical', () => {
    const rendered = renderPrompt({ ...custom, level: 'danger' }, placeholders, t);
    expect(rendered.confirmWord).toBeNull();
  });
});

describe('fallbackPrompt', () => {
  it('interpola le chiavi built-in del livello richiesto', () => {
    const rendered = fallbackPrompt('warning', placeholders, t);
    expect(rendered.title).toBe('t:danger.builtin.warning.title');
    expect(rendered.confirmWord).toBeNull();
  });
});

describe('severità', () => {
  it('ordina i livelli', () => {
    expect(LEVEL_SEVERITY.critical).toBeGreaterThan(LEVEL_SEVERITY.danger);
    expect(LEVEL_SEVERITY.danger).toBeGreaterThan(LEVEL_SEVERITY.warning);
    expect(LEVEL_SEVERITY.warning).toBeGreaterThan(LEVEL_SEVERITY.normal);
  });

  it('richiede conferma solo sopra "normal"', () => {
    expect(requiresConfirmation('normal')).toBe(false);
    expect(requiresConfirmation('warning')).toBe(true);
    expect(requiresConfirmation('critical')).toBe(true);
  });
});
