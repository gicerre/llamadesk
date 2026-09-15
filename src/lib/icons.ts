import {
  Blocks,
  BookOpen,
  Box,
  Briefcase,
  Code,
  Database,
  Globe,
  House,
  Palette,
  Rocket,
  Server,
  Sparkles,
  Terminal,
  type LucideIcon,
} from 'lucide-react';

/** Icone proposte per workspace e progetti, salvate come "lucide:<nome>". Il selettore completo arriva con la fase 8. */
export const ICON_LIBRARY: Record<string, LucideIcon> = {
  blocks: Blocks,
  box: Box,
  briefcase: Briefcase,
  'book-open': BookOpen,
  code: Code,
  database: Database,
  globe: Globe,
  house: House,
  palette: Palette,
  rocket: Rocket,
  server: Server,
  sparkles: Sparkles,
  terminal: Terminal,
};
