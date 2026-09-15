import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { useNodeView } from '@/lib/queries';
import { NodeMenu } from '../library/NodeMenu';
import { HeaderSkeleton, MissingNode, NodeHeader, PageFrame } from '../library/parts';
import { ScopeContent } from './ScopeContent';

/** Sezione a fuoco che sta direttamente in un workspace (fuori dai progetti). */
export function SectionPage() {
  const { t } = useTranslation();
  const { workspaceId = '', sectionId = '' } = useParams();
  const view = useNodeView(sectionId, workspaceId);

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
        actions={<NodeMenu view={view.data} workspaceId={workspaceId} />}
      />
      <div className="mt-7">
        <ScopeContent view={view.data} workspaceId={workspaceId} />
      </div>
    </PageFrame>
  );
}
