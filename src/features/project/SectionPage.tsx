import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useNodeView } from '@/lib/queries';
import { useDialogs } from '@/stores/dialogs';
import { NodeMenu } from '../library/NodeMenu';
import { HeaderSkeleton, MissingNode, NodeHeader, PageFrame } from '../library/parts';
import { LockedPanel } from '../protection/parts';
import { ScopeContent } from './ScopeContent';

/** Sezione a fuoco che sta direttamente in un workspace (fuori dai progetti). */
export function SectionPage() {
  const { t } = useTranslation();
  const { workspaceId = '', sectionId = '' } = useParams();
  const view = useNodeView(sectionId, workspaceId);
  const openAdd = useDialogs((state) => state.openAdd);

  if (view.isError) {
    return <MissingNode message={t('errors.nodeMissing')} workspaceId={workspaceId} />;
  }

  if (!view.data) {
    return (
      <PageFrame>
        <HeaderSkeleton />
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <NodeHeader
        view={view.data}
        workspaceId={workspaceId}
        actions={
          view.data.locked ? undefined : (
            <>
              <Button
                variant="primary"
                onClick={() => openAdd({ parentId: sectionId, workspaceId })}
              >
                <Plus />
                {t('add.title')}
              </Button>
              <NodeMenu view={view.data} workspaceId={workspaceId} />
            </>
          )
        }
      />
      {view.data.locked ? (
        <LockedPanel view={view.data} />
      ) : (
        <div className="mt-7">
          <ScopeContent view={view.data} workspaceId={workspaceId} />
        </div>
      )}
    </PageFrame>
  );
}
