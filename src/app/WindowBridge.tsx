import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { api, isTauri } from '@/lib/ipc';
import { invalidateLibrary, keys, queryClient, useWorkspaces } from '@/lib/queries';
import { currentNodeId, parseNodeRoute, paths, workspaceFromPath } from '@/lib/routes';
import { useDialogs } from '@/stores/dialogs';
import { useInspector } from '@/stores/inspector';
import { toast, toastError } from '@/stores/toasts';
import i18n from '@/lib/i18n';
import { useProfileId } from '@/stores/session';
import { useUi } from '@/stores/ui';
import type { WorkspaceEntry } from '@/types/generated/WorkspaceEntry';

/** Evento della tray: "Impostazioni". */
const OPEN_SETTINGS_EVENT = 'llamadesk://open-settings';

/** Il bersaglio di un tasto e' un campo di testo? Allora le scorciatoie tacciono. */
function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

/**
 * Collega l'app al sistema: scorciatoie da tastiera della finestra, tasti
 * laterali del mouse, eventi della tray, memoria dell'ultima pagina visitata
 * per ogni workspace.
 */
export function WindowBridge() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const profileId = useProfileId();
  const workspaces = useWorkspaces();
  const toggleSidebar = useUi((state) => state.toggleSidebar);
  const setLastWorkspace = useUi((state) => state.setLastWorkspace);

  // Tastiera e mouse.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && !event.ctrlKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        navigate(-1);
        return;
      }
      if (event.altKey && !event.ctrlKey && event.key === 'ArrowRight') {
        event.preventDefault();
        navigate(1);
        return;
      }
      if (event.key === 'F5') {
        // L'unico "aggiorna" sensato in un'app locale: ricontrollare il disco.
        event.preventDefault();
        void queryClient.invalidateQueries({ queryKey: ['paths'] });
        return;
      }
      if (
        event.key === 'Escape' &&
        useInspector.getState().nodeId &&
        !isTyping(event.target) &&
        !document.querySelector('[role="dialog"], [role="menu"]')
      ) {
        useInspector.getState().close();
        return;
      }
      if (!event.ctrlKey || event.altKey) return;

      // Le impostazioni si aprono anche mentre si scrive: Ctrl+, non inserisce testo.
      if (event.key === ',') {
        event.preventDefault();
        navigate(paths.settings);
        return;
      }
      if (isTyping(event.target)) return;

      const route = parseNodeRoute(pathname);
      const pageNode = currentNodeId(route);
      const inspected = useInspector.getState().nodeId;
      const key = event.key.toLowerCase();

      if (key === 'n' && pageNode && route.workspaceId) {
        // Nuovo nel contesto corrente: si incolla o si scrive, il tipo si riconosce.
        event.preventDefault();
        useDialogs.getState().openAdd({ parentId: pageNode, workspaceId: route.workspaceId });
      } else if (key === 'i' && pageNode && route.workspaceId) {
        event.preventDefault();
        const inspector = useInspector.getState();
        if (inspected) inspector.close();
        else inspector.open(pageNode, route.workspaceId);
      } else if (key === 'd' && (inspected ?? pageNode) && profileId) {
        event.preventDefault();
        const target = (inspected ?? pageNode) as string;
        void api
          .toggleFavorite(profileId, target)
          .then((added) => {
            toast({ title: i18n.t(added ? 'actions.favoriteAdded' : 'actions.favoriteRemoved') });
            return invalidateLibrary();
          })
          .catch((error) => toastError(i18n.t('actions.favoriteFailed'), error));
      } else if (key === 'b') {
        event.preventDefault();
        toggleSidebar();
      } else if (/^[1-9]$/.test(event.key)) {
        const target = workspaces.data?.[Number(event.key) - 1];
        if (target) {
          event.preventDefault();
          navigate(target.lastRoute ?? paths.workspace(target.node.id));
        }
      }
    };

    // Tasti laterali del mouse: 3 = indietro, 4 = avanti.
    const onMouseUp = (event: MouseEvent) => {
      if (event.button === 3) navigate(-1);
      if (event.button === 4) navigate(1);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [navigate, pathname, profileId, toggleSidebar, workspaces.data]);

  // Tray.
  useEffect(() => {
    if (!isTauri()) return;
    const pending = listen(OPEN_SETTINGS_EVENT, () => navigate(paths.settings));
    return () => void pending.then((unlisten) => unlisten());
  }, [navigate]);

  // Ultima pagina per workspace: cambiando workspace si riparte da li'.
  const workspaceId = workspaceFromPath(pathname);
  useEffect(() => {
    if (!workspaceId || !profileId) return;
    setLastWorkspace(workspaceId);
    const timer = window.setTimeout(() => {
      void api
        .rememberWorkspaceRoute(profileId, workspaceId, pathname)
        .then(() =>
          // La cache resta allineata senza rileggere l'elenco dei workspace.
          queryClient.setQueryData<WorkspaceEntry[]>(keys.workspaces(profileId), (entries) =>
            entries?.map((entry) =>
              entry.node.id === workspaceId ? { ...entry, lastRoute: pathname } : entry,
            ),
          ),
        )
        .catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [pathname, workspaceId, profileId, setLastWorkspace]);

  return null;
}
