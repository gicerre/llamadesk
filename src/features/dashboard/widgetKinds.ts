import {
  CalendarDays,
  Clock,
  FolderKanban,
  Layers,
  Star,
  StickyNote,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import type { DashboardWidget, WidgetKind } from '@/types/domain';

interface WidgetKindInfo {
  icon: LucideIcon;
  titleKey: string;
  /** Righe mostrate se l'utente non ha scelto; assente = non è un elenco. */
  defaultLimit?: number;
}

/** Aspetto e comportamento di ogni tipo di widget. */
export const WIDGET_KINDS: Record<WidgetKind, WidgetKindInfo> = {
  favorites: { icon: Star, titleKey: 'dashboard.widgets.favorites', defaultLimit: 9 },
  recents: { icon: Clock, titleKey: 'dashboard.widgets.recents', defaultLimit: 6 },
  quick_workspaces: {
    icon: Layers,
    titleKey: 'dashboard.widgets.quickWorkspaces',
    defaultLimit: 6,
  },
  calendars: { icon: CalendarDays, titleKey: 'dashboard.widgets.calendars', defaultLimit: 6 },
  projects: { icon: FolderKanban, titleKey: 'dashboard.widgets.projects', defaultLimit: 9 },
  notes: { icon: StickyNote, titleKey: 'dashboard.widgets.notes', defaultLimit: 6 },
  tags: { icon: Tag, titleKey: 'dashboard.widgets.tags' },
};

/** Le scelte offerte per il numero di righe (Rust accetta 1–50). */
export const LIMIT_CHOICES = [3, 6, 9, 12] as const;

/** Righe effettive di un widget: la sua configurazione, o il default del tipo. */
export const widgetLimit = (widget: DashboardWidget): number =>
  widget.config.limit ?? WIDGET_KINDS[widget.kind].defaultLimit ?? Infinity;
