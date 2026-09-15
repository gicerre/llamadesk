import { useTranslation } from 'react-i18next';
import { ImagePlus, X } from 'lucide-react';
import { CoverFocus } from '@/components/Cover';
import { Button } from '@/components/ui/Button';
import { api, isTauri } from '@/lib/ipc';
import { pickImage } from '@/lib/pickers';
import { invalidateLibrary } from '@/lib/queries';
import { toastError } from '@/stores/toasts';
import type { NodePatch } from '@/types/generated/NodePatch';
import type { NodeView } from '@/types/generated/NodeView';

/** Cover di workspace e progetti: immagine, punto focale, rimozione. */
export function CoverField({
  view,
  onSave,
}: {
  view: NodeView;
  onSave: (patch: NodePatch) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { node } = view;

  const setCover = async (sourcePath: string | null) => {
    try {
      await api.setNodeCover(node.id, sourcePath);
      await invalidateLibrary();
    } catch (error) {
      toastError(t('cover.failed'), error);
    }
  };

  const choose = async () => {
    const path = await pickImage();
    if (path) await setCover(path);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-ink-2 text-xs font-semibold">{t('cover.label')}</span>
      {node.coverAssetId && (
        <>
          <CoverFocus
            node={node}
            onFocus={(coverFocusX, coverFocusY) =>
              void onSave({ coverFocusX, coverFocusY }).catch((error) =>
                toastError(t('settings.saveFailed'), error),
              )
            }
          />
          <p className="text-ink-3 text-xs">{t('cover.focusHint')}</p>
        </>
      )}
      {isTauri() ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void choose()}>
            <ImagePlus />
            {node.coverAssetId ? t('cover.change') : t('cover.choose')}
          </Button>
          {node.coverAssetId && (
            <Button size="sm" variant="ghost" onClick={() => void setCover(null)}>
              <X />
              {t('cover.remove')}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-ink-3 text-xs">{t('cover.appOnly')}</p>
      )}
    </div>
  );
}
