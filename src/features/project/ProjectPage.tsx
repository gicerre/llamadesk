import { useTranslation } from 'react-i18next';
import { NavLink, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus } from 'lucide-react';
import { NodeIcon } from '@/components/NodeIcon';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/feedback';
import { Tip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { LAYOUT_IDS, settle } from '@/lib/motion';
import { useNodeView } from '@/lib/queries';
import { routeForChain } from '@/lib/routes';
import { useDialogs } from '@/stores/dialogs';
import type { NodeView } from '@/types/generated/NodeView';
import { NodeMenu } from '../library/NodeMenu';
import { Chip, HeaderSkeleton, MissingNode, NodeHeader, PageFrame } from '../library/parts';
import { ScopeContent } from './ScopeContent';

/**
 * Pagina del progetto (docs/REDESIGN.md § 11): un'intestazione sola, i
 * sottoprogetti come ambiti (D3) e sotto il contenuto dell'ambito o della
 * sezione a fuoco. Cambiare ambito cambia solo il contenuto.
 */
export function ProjectPage() {
  const { t } = useTranslation();
  const { workspaceId = '', projectId = '', subprojectId, sectionId } = useParams();
  const project = useNodeView(projectId, workspaceId);
  const scopeId = sectionId ?? subprojectId ?? projectId;
  const scope = useNodeView(scopeId, workspaceId);

  if (project.isError || scope.isError) {
    return <MissingNode message={t('errors.nodeMissing')} workspaceId={workspaceId} />;
  }

  return (
    <PageFrame>
      {project.data ? (
        <NodeHeader
          view={project.data}
          workspaceId={workspaceId}
          actions={<NodeMenu view={project.data} workspaceId={workspaceId} />}
        />
      ) : (
        <HeaderSkeleton />
      )}

      {project.data && (
        <ScopeTabs
          project={project.data}
          workspaceId={workspaceId}
          activeId={subprojectId ?? null}
        />
      )}

      {scope.data && scope.data.node.id === scopeId ? (
        <>
          {scope.data.node.kind !== 'project' && (
            <ScopeBar view={scope.data} workspaceId={workspaceId} />
          )}
          <ScopeContent view={scope.data} workspaceId={workspaceId} />
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-row" />
          <Skeleton className="h-row" />
        </div>
      )}
    </PageFrame>
  );
}

function ScopeTabs({
  project,
  workspaceId,
  activeId,
}: {
  project: NodeView;
  workspaceId: string;
  activeId: string | null;
}) {
  const { t } = useTranslation();
  const openCreate = useDialogs((state) => state.openCreate);
  const subprojects = project.children.filter((entry) => entry.node.kind === 'subproject');
  const base = routeForChain(workspaceId, project.breadcrumb);

  const tabs = [
    { id: null, label: t('scope.overview'), to: base },
    ...subprojects.map((entry) => ({
      id: entry.node.id,
      label: entry.node.name,
      to: `${base}/s/${entry.node.id}`,
    })),
  ];

  return (
    <nav
      aria-label={t('scope.tabs')}
      className="mt-6 mb-5 flex items-end gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--ld-line)]"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <NavLink
            key={tab.id ?? 'overview'}
            to={tab.to}
            end
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex h-9 shrink-0 items-center px-2.5 text-sm transition-colors duration-120',
              active ? 'text-ink font-semibold' : 'text-ink-2 hover:text-ink',
            )}
          >
            {tab.label}
            {active && (
              <motion.span
                layoutId={LAYOUT_IDS.scopeTab}
                transition={settle}
                className="bg-accent absolute inset-x-1.5 bottom-0 h-0.5 rounded-full"
              />
            )}
          </NavLink>
        );
      })}
      <Tip label={t('create.title.subproject')}>
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className="mb-1 ml-1"
          aria-label={t('create.title.subproject')}
          onClick={() => openCreate({ kind: 'subproject', parentId: project.node.id, workspaceId })}
        >
          <Plus />
        </Button>
      </Tip>
    </nav>
  );
}

/** Barra dell'ambito: il sottoprogetto o la sezione a fuoco, con le sue azioni. */
function ScopeBar({ view, workspaceId }: { view: NodeView; workspaceId: string }) {
  const { t } = useTranslation();
  const { node, caution } = view;
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <NodeIcon
        kind={node.kind}
        name={node.name}
        icon={node.icon}
        color={node.colorMain}
        size="md"
      />
      <h2 className="font-display text-ink text-lg font-semibold">{node.name}</h2>
      {caution.level !== 'none' && (
        <Chip tone="danger">
          {caution.isOwn
            ? t('states.caution')
            : t('states.cautionBy', { name: caution.inheritedFrom?.name ?? '' })}
        </Chip>
      )}
      <div className="ml-auto">
        <NodeMenu view={view} workspaceId={workspaceId} />
      </div>
    </div>
  );
}
