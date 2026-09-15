import {
  AppWindow,
  Code2,
  Copy,
  ExternalLink,
  FolderOpen,
  FolderSearch,
  Globe,
  Layers,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react';
import type { Node } from '@/types/generated/Node';
import type { PathInfo } from '@/types/generated/PathInfo';
import type { ToolKind } from '@/types/generated/ToolKind';

/* ============================================================================
   Registro delle azioni (docs/REDESIGN.md § 8), lato presentazione.

   Qui si decide QUALI azioni offrire per un elemento e con che peso; Rust
   decide se e come eseguirle. Le etichette sono chiavi i18n: il nome dello
   strumento arriva solo quando serve (menu aperto), non per ogni riga.
   ========================================================================== */

/** Azioni eseguite da Rust. `copy` resta nel frontend (scrive negli appunti). */
export type BackendActionId = 'open' | 'open_with' | 'terminal' | 'reveal' | 'open_remote';
export type ActionId = BackendActionId | 'copy';

export interface ActionDef {
  id: ActionId;
  /** Chiave in `actions.run.*`. */
  label: string;
  icon: LucideIcon;
  /** L'azione usa uno strumento di questo tipo: il menu offre "con… ▸". */
  tool?: ToolKind;
  /**
   * `primary` — clic sulla riga e Invio · `quick` — pulsanti al passaggio del
   * mouse · `menu` — solo nel menu.
   */
  weight: 'primary' | 'quick' | 'menu';
}

export interface ActionTarget {
  node: Pick<Node, 'kind' | 'url' | 'path'>;
  pathInfo?: PathInfo;
}

export function isExecutable(kind: Node['kind']): boolean {
  return kind === 'link' || kind === 'link_group' || kind === 'path';
}

export function actionsFor({ node, pathInfo }: ActionTarget): ActionDef[] {
  const copy: ActionDef = {
    id: 'copy',
    label: node.kind === 'path' ? 'copyPath' : 'copyUrl',
    icon: Copy,
    weight: 'menu',
  };

  switch (node.kind) {
    case 'link':
      return [
        { id: 'open', label: 'open', icon: ExternalLink, weight: 'primary' },
        {
          id: 'open_with',
          label: 'openInBrowser',
          icon: AppWindow,
          tool: 'browser',
          weight: 'menu',
        },
        copy,
      ];

    case 'link_group':
      return [
        { id: 'open', label: 'openAll', icon: Layers, weight: 'primary' },
        {
          id: 'open_with',
          label: 'openAllInBrowser',
          icon: AppWindow,
          tool: 'browser',
          weight: 'menu',
        },
      ];

    case 'path': {
      const kind = pathInfo?.kind;
      if (kind === 'missing' || kind === 'unavailable') return [copy];

      const ide: ActionDef = {
        id: 'open_with',
        label: 'openInIde',
        icon: Code2,
        tool: 'ide',
        weight: 'quick',
      };
      const terminal: ActionDef = {
        id: 'terminal',
        label: 'terminal',
        icon: SquareTerminal,
        tool: 'terminal',
        weight: 'quick',
      };
      const reveal: ActionDef = {
        id: 'reveal',
        label: 'reveal',
        icon: FolderSearch,
        weight: 'menu',
      };

      if (kind === 'repository') {
        return [
          { ...ide, weight: 'primary' },
          terminal,
          { id: 'open', label: 'explorer', icon: FolderOpen, weight: 'quick' },
          { id: 'open_remote', label: 'openRemote', icon: Globe, weight: 'menu' },
          reveal,
          copy,
        ];
      }
      if (kind === 'file') {
        return [
          { id: 'open', label: 'open', icon: ExternalLink, weight: 'primary' },
          { ...reveal, weight: 'quick' },
          { ...ide, weight: 'menu' },
          { ...terminal, label: 'terminalFolder', weight: 'menu' },
          copy,
        ];
      }
      // Cartella, o tipo non ancora noto: Esplora risorse e' sempre sensato.
      return [
        { id: 'open', label: 'explorer', icon: FolderOpen, weight: 'primary' },
        ide,
        terminal,
        reveal,
        copy,
      ];
    }

    default:
      return [];
  }
}

export function primaryAction(target: ActionTarget): ActionDef | undefined {
  return actionsFor(target).find((action) => action.weight === 'primary');
}

/** Il testo da copiare: indirizzo o percorso. */
export function copyText(node: Pick<Node, 'url' | 'path'>): string {
  return node.url ?? node.path ?? '';
}
