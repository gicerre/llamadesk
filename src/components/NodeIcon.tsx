import { createElement } from 'react';
import { Blocks, Box, Briefcase, Folder, Hash, Layers, Link2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ICON_LIBRARY } from '@/lib/icons';
import { BRAND_COLOR, initials } from '@/lib/identity';
import type { NodeKind } from '@/types/generated/NodeKind';

/* ============================================================================
   Icone degli oggetti della libreria.

   Workspace e progetti hanno una tessera colorata con icona o iniziali: sono
   i livelli che si riconoscono a colpo d'occhio. Tutto il resto usa un glifo
   neutro del proprio tipo. Il selettore completo arriva con la fase 8: qui
   si risolvono i nomi salvati come "lucide:<nome>" (vedi `lib/icons.ts`).
   ========================================================================== */

const KIND_GLYPH: Record<NodeKind, LucideIcon> = {
  workspace: Briefcase,
  project: Box,
  subproject: Blocks,
  section: Hash,
  link: Link2,
  link_group: Layers,
  path: Folder,
};

function libraryIcon(icon: string | null): LucideIcon | null {
  if (!icon?.startsWith('lucide:')) return null;
  return ICON_LIBRARY[icon.slice('lucide:'.length)] ?? null;
}

interface NodeIconProps {
  kind: NodeKind;
  name: string;
  icon: string | null;
  color: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const TILE_SIZE = {
  xs: 'size-4 rounded-[4px] text-[8px]',
  sm: 'size-5 rounded-[5px] text-[9px]',
  md: 'size-7 rounded-[7px] text-[11px]',
  lg: 'size-11 rounded-[11px] text-[15px]',
} as const;

const GLYPH_SIZE = { xs: 'size-3.5', sm: 'size-4', md: 'size-4', lg: 'size-5' } as const;

export function NodeIcon({ kind, name, icon, color, size = 'sm', className }: NodeIconProps) {
  const Custom = libraryIcon(icon);

  if (kind === 'workspace' || kind === 'project') {
    // Senza colore proprio un progetto prende l'accento del workspace da cui lo
    // si guarda (docs/REDESIGN.md § 4); un workspace, il colore del brand.
    const tint = color ?? (kind === 'project' ? 'var(--ld-accent-base)' : BRAND_COLOR);
    return (
      <span
        aria-hidden
        className={cn(
          'font-display flex shrink-0 items-center justify-center font-bold tracking-tight text-white',
          TILE_SIZE[size],
          className,
        )}
        style={{
          // Progetto: una sfumatura verso il colore del brand, a distinguerlo
          // dal workspace a tinta piena.
          background:
            kind === 'project'
              ? `linear-gradient(135deg, ${tint}, color-mix(in oklch, ${tint} 60%, ${BRAND_COLOR}))`
              : tint,
        }}
      >
        {Custom
          ? createElement(Custom, { className: cn(GLYPH_SIZE[size], 'text-white') })
          : initials(name)}
      </span>
    );
  }

  // Il glifo dei percorsi (file, cartella, repository) arrivera' dal tipo
  // rilevato sul disco nella fase 3; per ora vale quello del tipo di nodo.
  const Glyph = Custom ?? KIND_GLYPH[kind];
  // createElement: il glifo dipende dai dati, non e' un componente definito qui.
  return createElement(Glyph, {
    'aria-hidden': true,
    className: cn(GLYPH_SIZE[size], 'text-ink-3 shrink-0', className),
  });
}
