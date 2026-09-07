/* ============================================================================
   Modello di dominio condiviso con il backend Rust.
   Ogni struct Rust è serializzata in camelCase (serde rename_all).
   NOTA: in Fase 3 questi tipi verranno generati automaticamente da Rust
   tramite `ts-rs`, eliminando ogni possibilità di drift.
   ========================================================================== */

/** Livelli della Danger Zone. `null` su un'entità = "eredita dal padre". */
export type DangerLevel = 'normal' | 'warning' | 'danger' | 'critical';

/** Sentinella accettata dai comandi di update per tornare a ereditare. */
export const INHERIT = 'inherit';

/** Tipi di nodo contenitore. La gerarchia ammessa è dato, non schema. */
export type ContainerKind = 'project' | 'workspace' | 'environment' | 'context' | 'group';

/** Natura di un link: puramente semantica/visiva, nessuna integrazione esterna. */
export type LinkKind = 'web' | 'calendar' | 'mail' | 'doc' | 'other';

export type ThemeMode = 'light' | 'dark' | 'system';

export type Language = 'en' | 'it';

/** Salute di un link, calcolata solo dalla cronologia locale. */
export type Staleness = 'fresh' | 'aging' | 'dormant' | 'never';

export interface Profile {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  backgroundId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Container {
  id: string;
  profileId: string;
  parentId: string | null;
  kind: ContainerKind;
  name: string;
  slug: string | null;
  description: string | null;
  icon: string | null;
  color: string | null;
  badgeText: string | null;
  backgroundId: string | null;
  dangerLevel: DangerLevel | null;
  dangerPromptId: string | null;
  isFavorite: boolean;
  isArchived: boolean;
  sortOrder: number;
}

export interface Application {
  id: string;
  profileId: string;
  containerId: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  dangerLevel: DangerLevel | null;
  dangerPromptId: string | null;
  isFavorite: boolean;
  sortOrder: number;
}

export interface Link {
  id: string;
  applicationId: string;
  name: string;
  url: string;
  kind: LinkKind;
  description: string | null;
  icon: string | null;
  color: string | null;
  dangerLevel: DangerLevel | null;
  dangerPromptId: string | null;
  isFavorite: boolean;
  isDefault: boolean;
  sortOrder: number;
}

/** Un'applicazione con i suoi link: l'unità che la UI disegna come card. */
export type ApplicationWithLinks = Application & { links: Link[] };

export interface Crumb {
  id: string;
  name: string;
  kind: ContainerKind;
  icon: string | null;
  color: string | null;
  badgeText: string | null;
}

export interface ContainerView {
  container: Container;
  breadcrumb: Crumb[];
  children: Container[];
  applications: ApplicationWithLinks[];
  danger: ResolvedDanger;
  siblingEnvironments: Container[];
}

/* ------------------------------------------------------------ danger zone */

export interface ResolvedDanger {
  level: DangerLevel;
  inheritedFromId: string | null;
  inheritedFromName: string | null;
  inheritedFromKind: string | null;
  /** `true` se il livello è definito sull'entità stessa, non ereditato. */
  isOwn: boolean;
  promptId: string | null;
}

export interface DangerPrompt {
  id: string;
  profileId: string | null;
  name: string;
  level: Exclude<DangerLevel, 'normal'>;
  /** Se `isBuiltin` è true questi campi sono chiavi i18n, non testo letterale. */
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmWord: string | null;
  isBuiltin: boolean;
}

/** Tutto ciò che serve per decidere se e come chiedere conferma. */
export interface OpenIntent {
  linkId: string;
  linkName: string;
  url: string;
  applicationName: string;
  danger: ResolvedDanger;
  prompt: DangerPrompt | null;
  placeholders: Record<string, string>;
}

/** Piano di apertura di un intero workspace. */
export interface BulkOpenPlan {
  total: number;
  protected: OpenIntent[];
  safeLinkIds: string[];
  highestLevel: DangerLevel;
  confirmWord: string | null;
}

/* --------------------------------------------------- ricerca e salute link */

export interface SearchHit {
  entityType: 'link' | 'container';
  id: string;
  name: string;
  subtitle: string | null;
  path: string;
  icon: string | null;
  color: string | null;
  dangerLevel: DangerLevel;
  score: number;
}

export interface LinkUsage {
  linkId: string;
  lastOpenedAt: string | null;
  openCount: number;
  daysSinceLastOpen: number | null;
  staleness: Staleness;
}

export interface DeleteImpact {
  containers: number;
  applications: number;
  links: number;
}

/* --------------------------------------------------------- configurazione */

export interface AppSettings {
  theme: ThemeMode;
  language: Language;
  /** Acceleratore globale, sintassi Tauri (es. "CmdOrCtrl+Space"). */
  globalShortcut: string;
  /** Acceleratore della cattura rapida da appunti. */
  captureShortcut: string;
  startMinimized: boolean;
  closeToTray: boolean;
  autostart: boolean;
  activeProfileId: string | null;
  backgroundId: string | null;
  /** 0–100: intensità dell'overlay di leggibilità sopra il wallpaper. */
  overlayOpacity: number;
  /** Millisecondi fra un'apertura e l'altra in "Apri tutto". */
  openDelayMs: number;
  /** Modalità sperimentale: finestra realmente trasparente (Acrylic nativo). */
  systemTransparency: boolean;
  /** Giorni di inattività oltre i quali un link è segnalato come dormiente. */
  staleLinkDays: number;
}

export interface BootstrapPayload {
  isFirstRun: boolean;
  appVersion: string;
  dbPath: string;
  systemLocale: string;
  profiles: Profile[];
  settings: AppSettings;
}

export interface ShortcutStatus {
  accelerator: string;
  registered: boolean;
  error: string | null;
}

/* ------------------------------------------------------------- tag e note */

export interface Tag {
  id: string;
  profileId: string;
  name: string;
  color: string | null;
}

export type TaggableType = 'container' | 'application' | 'link';
export type NotableType = 'profile' | TaggableType;

export interface Note {
  id: string;
  entityType: NotableType;
  entityId: string;
  content: string;
  updatedAt: string;
}

/* --------------------------------------------------- quick workspaces --- */

export interface Bundle {
  id: string;
  profileId: string;
  name: string;
  icon: string | null;
  color: string | null;
  isTemporary: boolean;
  expiresAt: string | null;
  openDelayMs: number;
  sortOrder: number;
}

export type BundleWithLinks = Bundle & { links: Link[] };

/* ---------------------------------------------------------------- sfondi */

export type BackgroundSource = 'builtin' | 'file' | 'gradient' | 'solid';

export interface Background {
  id: string;
  name: string;
  source: BackgroundSource;
  /** id built-in, percorso del file, gradiente CSS o colore esadecimale. */
  value: string;
  blur: number;
  overlayOpacity: number;
}

/* ------------------------------------------------------- backup/restore */

export type ImportMode = 'merge' | 'replace';

export interface BackupPreview {
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
  profiles: number;
  containers: number;
  applications: number;
  links: number;
  bundles: number;
}

export interface ImportSummary {
  profiles: number;
  containers: number;
  applications: number;
  links: number;
  bundles: number;
  notes: number;
  tags: number;
}
