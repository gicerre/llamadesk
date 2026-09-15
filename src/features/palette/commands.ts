import type { TFunction } from 'i18next';
import type { NavigateFunction } from 'react-router-dom';
import {
  Box,
  Briefcase,
  Clock,
  House,
  Monitor,
  Moon,
  PanelLeft,
  Plus,
  RefreshCw,
  Rows3,
  Settings,
  SlidersHorizontal,
  Star,
  Sun,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/ipc';
import { invalidateTools, queryClient } from '@/lib/queries';
import { paths } from '@/lib/routes';
import { useDialogs } from '@/stores/dialogs';
import { useInspector } from '@/stores/inspector';
import { useSession } from '@/stores/session';
import { toast, toastError } from '@/stores/toasts';
import { useUi } from '@/stores/ui';

/* ============================================================================
   Comandi dell'app nella palette (prefisso ">"). Sono pochi e noti: vivono
   nel frontend e si filtrano con `lib/fuzzy.ts`. Ogni comando dice quando ha
   senso (serve un workspace? una pagina?) e che scorciatoia ha gia'.
   ========================================================================== */

export interface PaletteContext {
  navigate: NavigateFunction;
  workspaceId: string | null;
  /** Il nodo mostrato dalla pagina, se la pagina ne mostra uno. */
  pageNodeId: string | null;
}

export interface CommandDef {
  id: string;
  label: string;
  /** Altre parole con cui trovarlo, in entrambe le lingue. */
  keywords: string;
  icon: LucideIcon;
  shortcut?: string;
  run: () => void;
}

export function buildCommands(t: TFunction, context: PaletteContext): CommandDef[] {
  const { navigate, workspaceId, pageNodeId } = context;
  const dialogs = useDialogs.getState();
  const session = useSession.getState();
  const setTheme = (theme: 'light' | 'dark' | 'system') =>
    void session
      .updateSetting('theme', theme)
      .catch((error) => toastError(t('settings.saveFailed'), error));

  const commands: (CommandDef | false)[] = [
    !!pageNodeId &&
      !!workspaceId && {
        id: 'add',
        label: t('palette.commands.add'),
        keywords: 'aggiungi add link percorso path nuovo new',
        icon: Plus,
        shortcut: 'Ctrl+N',
        run: () => dialogs.openAdd({ parentId: pageNodeId, workspaceId }),
      },
    !!workspaceId && {
      id: 'new-project',
      label: t('create.title.project'),
      keywords: 'nuovo progetto new project crea create',
      icon: Box,
      run: () => dialogs.openCreate({ kind: 'project', parentId: workspaceId, workspaceId }),
    },
    {
      id: 'new-workspace',
      label: t('create.title.workspace'),
      keywords: 'nuovo workspace new area crea create',
      icon: Briefcase,
      run: () => dialogs.openCreate({ kind: 'workspace', parentId: null, workspaceId: null }),
    },
    !!pageNodeId &&
      !!workspaceId && {
        id: 'inspect-page',
        label: t('palette.commands.inspectPage'),
        keywords: 'modifica edit dettaglio details pannello inspector',
        icon: SlidersHorizontal,
        shortcut: 'Ctrl+I',
        run: () => useInspector.getState().open(pageNodeId, workspaceId),
      },
    !!workspaceId && {
      id: 'go-home',
      label: t('palette.commands.home'),
      keywords: 'home vai go inizio',
      icon: House,
      run: () => navigate(paths.workspace(workspaceId)),
    },
    !!workspaceId && {
      id: 'go-favorites',
      label: t('nav.favorites'),
      keywords: 'preferiti favorites stelle star',
      icon: Star,
      run: () => navigate(paths.favorites(workspaceId)),
    },
    !!workspaceId && {
      id: 'go-recents',
      label: t('nav.recents'),
      keywords: 'recenti recents cronologia history',
      icon: Clock,
      run: () => navigate(paths.recents(workspaceId)),
    },
    {
      id: 'settings',
      label: t('nav.settings'),
      keywords: 'impostazioni settings preferenze options',
      icon: Settings,
      shortcut: 'Ctrl+,',
      run: () => navigate(paths.settings),
    },
    {
      id: 'toggle-sidebar',
      label: t('palette.commands.toggleSidebar'),
      keywords: 'barra laterale sidebar nascondi mostra hide show',
      icon: PanelLeft,
      shortcut: 'Ctrl+B',
      run: () => useUi.getState().toggleSidebar(),
    },
    {
      id: 'theme-light',
      label: t('palette.commands.themeLight'),
      keywords: 'tema theme chiaro light aspetto appearance',
      icon: Sun,
      run: () => setTheme('light'),
    },
    {
      id: 'theme-dark',
      label: t('palette.commands.themeDark'),
      keywords: 'tema theme scuro dark aspetto appearance',
      icon: Moon,
      run: () => setTheme('dark'),
    },
    {
      id: 'theme-system',
      label: t('palette.commands.themeSystem'),
      keywords: 'tema theme sistema system automatico',
      icon: Monitor,
      run: () => setTheme('system'),
    },
    {
      id: 'density',
      label:
        session.settings?.density === 'compact'
          ? t('palette.commands.densityComfortable')
          : t('palette.commands.densityCompact'),
      keywords: 'densita density compatta compact righe rows',
      icon: Rows3,
      run: () =>
        void session
          .updateSetting(
            'density',
            session.settings?.density === 'compact' ? 'comfortable' : 'compact',
          )
          .catch((error) => toastError(t('settings.saveFailed'), error)),
    },
    {
      id: 'refresh-tools',
      label: t('palette.commands.refreshTools'),
      keywords: 'strumenti tools ide terminale terminal browser cerca rileva detect',
      icon: RefreshCw,
      run: () =>
        void api
          .refreshTools()
          .then(async (found) => {
            await invalidateTools();
            toast({
              title: t('tools.refreshed', {
                count: found.filter((tool) => tool.available).length,
              }),
            });
          })
          .catch((error) => toastError(t('tools.refreshFailed'), error)),
    },
    {
      id: 'recheck-paths',
      label: t('palette.commands.recheckPaths'),
      keywords: 'percorsi paths ricontrolla aggiorna refresh disco disk',
      icon: RefreshCw,
      shortcut: 'F5',
      run: () => void queryClient.invalidateQueries({ queryKey: ['paths'] }),
    },
    {
      id: 'new-profile',
      label: t('profiles.newTitle'),
      keywords: 'nuovo profilo new profile',
      icon: UserPlus,
      run: () => dialogs.openNewProfile(),
    },
  ];

  return commands.filter((command): command is CommandDef => command !== false);
}

/** Proposti a palette vuota: i comandi che servono piu' spesso. */
export const SUGGESTED_COMMANDS = ['add', 'new-project', 'settings'];
