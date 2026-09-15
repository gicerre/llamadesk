import { create } from 'zustand';
import { api } from '@/lib/ipc';
import { resolveLanguage, setLanguage } from '@/lib/i18n';
import type { AppSettings } from '@/types/generated/AppSettings';
import type { Profile } from '@/types/generated/Profile';
import type { ProfileSession } from '@/types/generated/ProfileSession';

/* ============================================================================
   Sessione: chi sta usando l'app e con quali impostazioni.

   I dati della libreria (workspace, nodi, preferiti) NON stanno qui: vivono
   nella cache di TanStack Query (`lib/queries.ts`). Qui resta solo cio' che
   serve prima di poter disegnare qualsiasi cosa.
   ========================================================================== */

type Status = 'loading' | 'ready' | 'error';
export type SettingScope = 'global' | 'profile';

interface SessionState {
  status: Status;
  error: string | null;
  isFirstRun: boolean;
  appVersion: string;
  dbPath: string;
  windowMaterial: 'mica' | 'solid';
  profiles: Profile[];
  activeProfileId: string | null;
  /** Effettive: globali sovrascritte da quelle del profilo attivo. */
  settings: AppSettings | null;
  overrides: string[];
  scopedKeys: string[];

  bootstrap: () => Promise<void>;
  completeWelcome: () => Promise<void>;
  activateProfile: (profileId: string) => Promise<void>;
  createProfile: (name: string) => Promise<Profile>;
  refreshProfiles: () => Promise<void>;
  /**
   * Cambia un'impostazione. Senza `scope` la scrittura segue cio' che l'utente
   * vede: se il profilo attivo sovrascrive la chiave, aggiorna l'override.
   */
  updateSetting: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
    scope?: SettingScope,
  ) => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  error: null,
  isFirstRun: false,
  appVersion: '',
  dbPath: '',
  windowMaterial: 'solid',
  profiles: [],
  activeProfileId: null,
  settings: null,
  overrides: [],
  scopedKeys: [],

  bootstrap: async () => {
    set({ status: 'loading', error: null });
    try {
      const payload = await api.bootstrap();
      // Al primissimo avvio vale la lingua di sistema; poi quella scelta.
      const language = payload.isFirstRun
        ? resolveLanguage(payload.systemLocale)
        : payload.settings.language;
      await setLanguage(language);
      const scopedKeys = await api.profileScopedKeys().catch(() => []);

      set({
        status: 'ready',
        isFirstRun: payload.isFirstRun,
        appVersion: payload.appVersion,
        dbPath: payload.dbPath,
        windowMaterial: payload.windowMaterial === 'mica' ? 'mica' : 'solid',
        profiles: payload.profiles,
        activeProfileId: payload.activeProfileId,
        settings: { ...payload.settings, language },
        overrides: payload.profileOverrides,
        scopedKeys,
      });
    } catch (error) {
      set({ status: 'error', error: error instanceof Error ? error.message : String(error) });
    }
  },

  completeWelcome: async () => {
    await api.completeOnboarding();
    set({ isFirstRun: false });
  },

  activateProfile: async (profileId) => {
    await enter(await api.activateProfile(profileId));
  },

  createProfile: async (name) => {
    const profile = await api.createProfile(name);
    await get().refreshProfiles();
    return profile;
  },

  refreshProfiles: async () => {
    set({ profiles: await api.listProfiles() });
  },

  updateSetting: async (key, value, scope) => {
    const { settings, activeProfileId, overrides } = get();
    if (!settings) return;

    const effectiveScope = scope ?? (overrides.includes(key) ? 'profile' : 'global');
    // Ottimistico: la UI non aspetta il disco.
    set({ settings: { ...settings, [key]: value } });
    if (key === 'language') await setLanguage(String(value));

    try {
      if (effectiveScope === 'profile' && activeProfileId) {
        const persisted = await api.setProfileSetting(activeProfileId, key, value);
        set({ settings: persisted, overrides: await api.profileOverrides(activeProfileId) });
      } else {
        set({ settings: await api.setSetting(key, value) });
      }
    } catch (error) {
      set({ settings });
      if (key === 'language') await setLanguage(settings.language);
      throw error;
    }
  },
}));

async function enter(session: ProfileSession) {
  await setLanguage(session.settings.language);
  useSession.setState({
    activeProfileId: session.profile.id,
    settings: session.settings,
    overrides: session.overrides,
  });
}

/** Il profilo attivo; `null` solo prima del bootstrap. */
export function useActiveProfile(): Profile | null {
  return useSession(
    (state) => state.profiles.find((profile) => profile.id === state.activeProfileId) ?? null,
  );
}

/** Id del profilo attivo per chi lo usa solo dopo il bootstrap. */
export function useProfileId(): string {
  return useSession((state) => state.activeProfileId ?? '');
}
