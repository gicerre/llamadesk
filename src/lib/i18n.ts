import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';
import it from '@/locales/it.json';

export type Language = 'en' | 'it';

export const SUPPORTED_LANGUAGES: readonly Language[] = ['en', 'it'] as const;
export const DEFAULT_LANGUAGE: Language = 'en';

/* Nessun language detector di rete e nessun caricamento asincrono:
   le traduzioni sono compilate nel bundle, l'app funziona offline per sempre. */
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    it: { translation: it },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Normalizza un locale di sistema (es. "it-IT") in una lingua supportata. */
export function resolveLanguage(locale: string | null | undefined): Language {
  const base = (locale ?? '').slice(0, 2).toLowerCase();
  return SUPPORTED_LANGUAGES.includes(base as Language) ? (base as Language) : DEFAULT_LANGUAGE;
}

export async function setLanguage(language: string): Promise<void> {
  const resolved = resolveLanguage(language);
  await i18n.changeLanguage(resolved);
  document.documentElement.lang = resolved;
}

export default i18n;
