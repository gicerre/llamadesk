import { create } from 'zustand';
import { ipc, isTauri } from '@/lib/ipc';
import { resolveLanguage, setLanguage } from '@/lib/i18n';
import type {
  AppSettings,
  BootstrapPayload,
  Profile,
  ProfileSession,
  SettingScope,
} from '@/types/domain';

/** Valori usati solo quando l'app gira in `vite dev` senza backend Tauri. */
const BROWSER_FALLBACK: BootstrapPayload = {
  isFirstRun: true,
  appVersion: '0.0.0-dev',
  dbPath: '(browser preview — nessun database)',
  systemLocale: navigator.language,
  profiles: [],
  activeProfileId: null,
  profileOverrides: [],
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
  /** Impostazioni **effettive**: globali sovrascritte da quelle del profilo. */
  settings: AppSettings | null;
  activeProfileId: string | null;
  /** Chiavi che il profilo attivo personalizza. */
  profileOverrides: string[];
  /** Chiavi personalizzabili per profilo, secondo il backend. */
  scopedKeys: string[];

  bootstrap: () => Promise<void>;
  completeOnboarding: () => Promise<void>;
  /**
   * Cambia un'impostazione.
   *
   * Senza `scope` esplicito la scrittura segue quello che l'utente sta
   * guardando: se il profilo attivo personalizza già quella chiave, aggiorna
   * l'override; altrimenti scrive il valore globale. Cambiare il tema e non
   * vedere accadere nulla, perché un override invisibile continua a vincere,
   * sarebbe il modo più rapido per far sembrare l'app rotta.
   */
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
    scope?: SettingScope,
  ) => Promise<void>;
  /** Rimuove l'override: il profilo torna a seguire il valore globale. */
  clearOverride: (key: keyof AppSettings) => Promise<void>;
  activateProfile: (profileId: string) => Promise<void>;
  createProfile: (name: string) => Promise<Profile | null>;
  renameProfile: (id: string, name: string) => Promise<void>;
  /**
   * Elimina un profilo. Se era quello attivo, il backend sceglie il profilo in
   * cui ricadere e lo attiva nella stessa transazione. Restituisce `false` se
   * l'eliminazione non è avvenuta.
   */
  deleteProfile: (id: string) => Promise<boolean>;
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
  profileOverrides: [],
  scopedKeys: [],

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

      // L'elenco delle chiavi personalizzabili arriva da Rust: tenerne una
      // copia qui significherebbe vederla divergere al primo cambiamento.
      const scopedKeys = isTauri() ? await ipc.profileScopedKeys().catch(() => []) : [];

      set({
        status: 'ready',
        isFirstRun: payload.isFirstRun,
        appVersion: payload.appVersion,
        dbPath: payload.dbPath,
        profiles: payload.profiles,
        settings: { ...payload.settings, language },
        activeProfileId: payload.activeProfileId,
        profileOverrides: payload.profileOverrides,
        scopedKeys,
      });
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  },

  completeOnboarding: async () => {
    if (isTauri()) await ipc.completeOnboarding();
    set({ isFirstRun: false });
  },

  updateSetting: async (key, value, scope) => {
    const { settings: current, activeProfileId: profileId, profileOverrides } = get();
    if (!current) return;

    const effectiveScope: SettingScope =
      scope ?? (profileOverrides.includes(key) ? 'profile' : 'global');

    // Aggiornamento ottimistico: la UI non deve mai "aspettare" il disco.
    set({ settings: { ...current, [key]: value } });

    try {
      if (!isTauri()) return;

      if (effectiveScope === 'profile' && profileId) {
        const persisted = await ipc.setProfileSetting(profileId, key, value);
        set({
          settings: persisted,
          profileOverrides: await ipc.getProfileOverrides(profileId),
        });
        return;
      }

      set({ settings: await ipc.setSetting(key, value) });
    } catch (error) {
      set({ settings: current, error: error instanceof Error ? error.message : String(error) });
    }
  },

  clearOverride: async (key) => {
    const profileId = get().activeProfileId;
    if (!profileId || !isTauri()) return;

    try {
      const persisted = await ipc.setProfileSetting(profileId, key, null);
      set({
        settings: persisted,
        profileOverrides: await ipc.getProfileOverrides(profileId),
      });
      await setLanguage(persisted.language);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  /**
   * Entrare in un profilo non cambia solo i dati: cambia anche tema, lingua e
   * sfondo, se quel profilo li personalizza. È il "climate shift" che rende
   * evidente in quale contesto si sta lavorando.
   */
  activateProfile: async (profileId) => {
    if (!isTauri()) {
      set({ activeProfileId: profileId });
      return;
    }

    try {
      await enterSession(await ipc.activateProfile(profileId));
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  createProfile: async (name) => {
    if (!isTauri()) return null;
    try {
      const created = await ipc.createProfile(name);
      set({ profiles: await ipc.listProfiles() });
      await get().activateProfile(created.id);
      return created;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  },

  renameProfile: async (id, name) => {
    if (!isTauri()) return;
    try {
      await ipc.renameProfile(id, name);
      set({ profiles: await ipc.listProfiles() });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
    }
  },

  deleteProfile: async (id) => {
    if (!isTauri()) return false;
    try {
      const session = await ipc.deleteProfile(id);
      const profiles = await ipc.listProfiles();
      // Prima il nuovo contesto, poi l'elenco: nessun render deve vedere un
      // profilo attivo che non esiste più.
      await enterSession(session);
      set({ profiles });
      return true;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  },
}));

/** Applica il contesto di un profilo appena attivato: dati, tema, lingua. */
async function enterSession(session: ProfileSession) {
  await setLanguage(session.settings.language);
  useSessionStore.setState({
    activeProfileId: session.profile.id,
    settings: session.settings,
    profileOverrides: session.overrides,
  });
}

/** Selettore comodo: il profilo attualmente attivo. */
export const useActiveProfile = (): Profile | null => {
  const { profiles, activeProfileId } = useSessionStore();
  return profiles.find((profile) => profile.id === activeProfileId) ?? profiles[0] ?? null;
};
