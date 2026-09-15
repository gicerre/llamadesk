import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Link2, Lock, Plus } from 'lucide-react';
import { NodeIcon } from '@/components/NodeIcon';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/feedback';
import { useNodeView } from '@/lib/queries';
import { routeForChain } from '@/lib/routes';
import { useDialogs } from '@/stores/dialogs';
import type { NodeEntry } from '@/types/generated/NodeEntry';
import type { NodeView } from '@/types/generated/NodeView';
import { NodeMenu } from '../library/NodeMenu';
import {
  HeaderSkeleton,
  MissingNode,
  NodeHeader,
  NodeRow,
  PageFrame,
  rowGrid,
  SectionTitle,
} from '../library/parts';

/**
 * Home del workspace (D6). In questa fase: intestazione, progetti e risorse
 * sciolte. "Continua" e "Preferiti in questo workspace" arrivano con la fase 3,
 * quando le azioni produrranno davvero dei recenti.
 */
export function WorkspacePage() {
  const { t } = useTranslation();
  const { workspaceId = '' } = useParams();
  const view = useNodeView(workspaceId, workspaceId);

  if (view.isError) {
    return <MissingNode message={t('errors.workspaceMissing')} workspaceId={null} />;
  }

  return (
    <PageFrame>
      {view.data ? (
        <NodeHeader
          view={view.data}
          workspaceId={workspaceId}
          actions={<NodeMenu view={view.data} workspaceId={workspaceId} />}
        />
      ) : (
        <HeaderSkeleton />
      )}
      {view.data && <WorkspaceContent view={view.data} workspaceId={workspaceId} />}
    </PageFrame>
  );
}

function WorkspaceContent({ view, workspaceId }: { view: NodeView; workspaceId: string }) {
  const { t } = useTranslation();
  const openCreate = useDialogs((state) => state.openCreate);
  const projects = view.children.filter((entry) => entry.node.kind === 'project');
  const others = view.children.filter((entry) => entry.node.kind !== 'project');
  const newProject = () => openCreate({ kind: 'project', parentId: workspaceId, workspaceId });

  if (view.children.length === 0) {
    return (
      <EmptyState
        className="mt-10"
        icon={<Plus />}
        title={t('workspace.emptyTitle')}
        description={t('workspace.emptyDescription')}
        actions={
          <Button variant="primary" onClick={newProject}>
            <Plus />
            {t('create.title.project')}
          </Button>
        }
      />
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-8">
      <section aria-labelledby="projects-title">
        <SectionTitle count={projects.length}>
          <span id="projects-title">{t('nav.projects')}</span>
        </SectionTitle>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(236px,1fr))] gap-3">
          {projects.map((entry) => (
            <ProjectCard key={entry.node.id} entry={entry} view={view} workspaceId={workspaceId} />
          ))}
          <button
            type="button"
            onClick={newProject}
            className="text-ink-3 hover:bg-hover hover:text-ink flex min-h-[116px] flex-col items-center justify-center gap-1.5 rounded-lg text-sm shadow-[inset_0_0_0_1px_var(--ld-line-strong)] transition-colors duration-120"
          >
            <Plus className="size-4" aria-hidden />
            {t('create.title.project')}
          </button>
        </div>
      </section>

      {others.length > 0 && (
        <section aria-labelledby="loose-title">
          <SectionTitle count={others.length}>
            <span id="loose-title">{t('workspace.resources')}</span>
          </SectionTitle>
          <div className={rowGrid}>
            {others.map((entry) => (
              <NodeRow
                key={entry.node.id}
                entry={entry}
                chain={view.breadcrumb}
                workspaceId={workspaceId}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ProjectCard({
  entry,
  view,
  workspaceId,
}: {
  entry: NodeEntry;
  view: NodeView;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { node } = entry;
  return (
    <button
      type="button"
      onClick={() => navigate(routeForChain(workspaceId, [...view.breadcrumb, node]))}
      className="group bg-surface shadow-1 hover:shadow-2 flex min-h-[116px] flex-col rounded-lg p-3.5 text-left transition-shadow duration-120"
    >
      <span className="flex items-start gap-3">
        <NodeIcon
          kind="project"
          name={node.name}
          icon={node.icon}
          color={node.colorMain}
          size="md"
        />
        <span className="text-ink-3 ml-auto flex items-center gap-1">
          {entry.parentCount > 1 && <Link2 className="size-3.5" aria-label={t('states.shared')} />}
          {node.isProtected && <Lock className="size-3.5" aria-label={t('states.protected')} />}
        </span>
      </span>
      <span className="mt-auto pt-3">
        <span className="font-display text-ink block truncate text-base font-semibold">
          {node.name}
        </span>
        <span className="text-ink-3 block truncate text-xs">
          {node.description ?? t('kinds.count.item', { count: entry.childCount })}
        </span>
      </span>
    </button>
  );
}
