import type { TFunction } from 'i18next';
import type { DangerLevel, DangerPrompt } from '@/types/domain';

/* ============================================================================
   Risoluzione dei testi di conferma.

   I prompt built-in salvano CHIAVI i18n (`danger.builtin.critical.title`), non
   testo: seguono la lingua dell'interfaccia. Quelli scritti dall'utente
   contengono testo letterale. In entrambi i casi passano dallo stesso
   interpolatore di segnaposto `{environment}`, `{application}`, ...
   ========================================================================== */

export interface RenderedPrompt {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Parola da digitare: valorizzata solo per il livello `critical`. */
  confirmWord: string | null;
}

/**
 * Sostituisce i segnaposto `{nome}`. Un segnaposto sconosciuto resta visibile:
 * meglio un `{cliente}` in chiaro che una frase mutilata.
 */
export function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

export function renderPrompt(
  prompt: DangerPrompt,
  placeholders: Record<string, string>,
  t: TFunction,
): RenderedPrompt {
  // Per i built-in il campo è una chiave i18n; per i custom è già testo.
  const resolve = (value: string) => (prompt.isBuiltin ? t(value) : value);

  return {
    title: interpolate(resolve(prompt.title), placeholders),
    message: interpolate(resolve(prompt.message), placeholders),
    confirmLabel: resolve(prompt.confirmLabel),
    cancelLabel: resolve(prompt.cancelLabel),
    confirmWord:
      prompt.level === 'critical'
        ? // La parola dei prompt built-in va tradotta: un utente italiano
          // non deve digitare "PROCEED".
          prompt.isBuiltin
          ? t('danger.confirmWord')
          : prompt.confirmWord
        : null,
  };
}

/** Testo di ripiego quando un livello richiede conferma ma manca il prompt. */
export function fallbackPrompt(
  level: DangerLevel,
  placeholders: Record<string, string>,
  t: TFunction,
): RenderedPrompt {
  return {
    title: interpolate(t(`danger.builtin.${level}.title`), placeholders),
    message: interpolate(t(`danger.builtin.${level}.message`), placeholders),
    confirmLabel: t(`danger.builtin.${level}.confirm`),
    cancelLabel: t(`danger.builtin.${level}.cancel`),
    confirmWord: level === 'critical' ? t('danger.confirmWord') : null,
  };
}

/** Ordine di severità, usato per scegliere il tono di un modale cumulativo. */
export const LEVEL_SEVERITY: Record<DangerLevel, number> = {
  normal: 0,
  warning: 1,
  danger: 2,
  critical: 3,
};

export const requiresConfirmation = (level: DangerLevel): boolean =>
  LEVEL_SEVERITY[level] > LEVEL_SEVERITY.normal;
