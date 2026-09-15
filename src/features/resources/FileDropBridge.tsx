import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { api, isTauri } from '@/lib/ipc';
import { invalidateLibrary } from '@/lib/queries';
import { nameForPath } from '@/lib/resources';
import { useProfileId } from '@/stores/session';
import { toast, toastError } from '@/stores/toasts';
import { dropTargetAt, useFileDrop } from './fileDrop';

/**
 * Ascolta i file trascinati sulla finestra. Tauri consegna le posizioni in
 * pixel fisici: con la scala di Windows al 125% o 150% vanno riportate a px CSS.
 */
export function FileDropBridge() {
  const { t } = useTranslation();
  const profileId = useProfileId();
  const setHover = useFileDrop((state) => state.setHover);

  useEffect(() => {
    if (!isTauri()) return;

    const pending = getCurrentWebview().onDragDropEvent((event) => {
      const { payload } = event;
      if (payload.type === 'leave') {
        setHover(null);
        return;
      }

      const scale = window.devicePixelRatio || 1;
      const target = dropTargetAt(payload.position.x / scale, payload.position.y / scale);

      if (payload.type === 'enter' || payload.type === 'over') {
        setHover(target);
        return;
      }

      setHover(null);
      if (!target) {
        toast({ title: t('resources.dropHere') });
        return;
      }

      void (async () => {
        try {
          for (const path of payload.paths) {
            await api.createNode(profileId, target, {
              kind: 'path',
              name: nameForPath(path),
              path,
            });
          }
          await invalidateLibrary();
          toast({ title: t('resources.dropped', { count: payload.paths.length }) });
        } catch (error) {
          await invalidateLibrary();
          toastError(t('resources.dropFailed'), error);
        }
      })();
    });

    return () => void pending.then((unlisten) => unlisten());
  }, [profileId, setHover, t]);

  return null;
}
