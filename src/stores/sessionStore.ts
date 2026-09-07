import { create } from 'zustand';
import { ipc, isTauri } from '@/lib/ipc';
import { resolveLanguage, setLanguage } from '@/lib/i18n';
import type { AppSettings, BootstrapPayload, Profile } from '@/types/domain';

/** Valori usati solo quando l'app gira in `vite dev` senza backend Tauri. */
const BROWSER_FALLBACK: BootstrapPayload = {
  isFirstRun: true,
  appVersion: '0.0.0-dev',
  dbPath: '(browser preview — nessun database)',
  systemLocale: navigator.language,
  profiles: [],
  settings: {
    theme: 'system',
    language: 'en',
    globalShortcut: 'CmdOrCtrl+Space',
    captureShortcut: 'CmdOrCtrl+Shift+L',
    startMinimized: false,
    closeToTray: true,
    autostart: false,
    activeProfileId: null,
    backgroundId: null,
    overlayOpacity: 30,
    openDelayMs: 250,
    systemTransparency: false,
    staleLinkDays: 90,
  },
};

type Status = 'idle' | 'loading' | 'ready' | 'error';

interface SessionState {
  status: Status;
  error: string | null;
  isFirstRun: boolean;
  appVersion: string;
  dbPath: string;
  profiles: Profile[];
  settings: AppSettings | null;
  activeProfileId: string | null;

  bootstrap: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
  setActiveProfile: (profileId: string) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  status: 'idle',
  error: null,
  isFirstRun: false,
  appVersion: '',
  dbPath: '',
  profiles: [],
  settings: null,
  activeProfileId: null,

  /** Unico punto d'ingresso: legge dal backend tutto ciò che serve al primo render. */
  bootstrap: async () => {
    set({ status: 'loading', error: null });
    try {
      const payload = isTauri() ? await ipc.bootstrap() : BROWSER_FALLBACK;

      // Al primissimo avvio adottiamo la lingua di sistema; poi vince la scelta utente.
      const language = payload.isFirstRun
        ? resolveLanguage(payload.systemLocale)
        : payload.settings.language;
      await setLanguage(language);

      set({
        status: 'ready',
        isFirstRun: payload.isFirstRun,
        appVersion: payload.appVersion,
        dbPath: payload.dbPath,
        profiles: payload.profiles,
        settings: { ...payload.settings, language },
        activeProfileId: payload.settings.activeProfileId ?? payload.profiles[0]?.id ?? null,
      });
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  },

  completeOnboarding: async () => {
    if (isTauri()) await ipc.completeOnboarding();
    set({ isFirstRun: false });
  },

  updateSetting: async (key, value) => {
    const current = get().settings;
    if (!current) return;

    // Aggiornamento ottimistico: la UI non deve mai "aspettare" il disco.
    set({ settings: { ...current, [key]: value } });
    try {
      if (isTauri()) {
        const persisted = await ipc.setSetting(key, value);
        set({ settings: persisted });
      }
    } catch (error) {
      set({ settings: current, error: error instanceof Error ? error.message : String(error) });
    }
  },

  setActiveProfile: (profileId) => {
    set({ activeProfileId: profileId });
    void get().updateSetting('activeProfileId', profileId);
  },
}));

/** Selettore comodo: il profilo attualmente attivo. */
export const useActiveProfile = (): Profile | null => {
  const { profiles, activeProfileId } = useSessionStore();
  return profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null;
};
