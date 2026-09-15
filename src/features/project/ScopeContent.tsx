import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, CircleAlert, Hash, Plus } from 'lucide-react';
import { NodeIcon } from '@/components/NodeIcon';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton } from '@/components/ui/feedback';
import { useChildren } from '@/lib/queries';
import { routeForChain } from '@/lib/routes';
import { useDialogs } from '@/stores/dialogs';
import type { Crumb } from '@/types/generated/Crumb';
import type { NodeEntry } from '@/types/generated/NodeEntry';
import type { NodeView } from '@/types/generated/NodeView';
import { NodeRow, rowGrid, SectionTitle } from '../library/parts';

interface ScopeContentProps {
  view: NodeView;
  workspaceId: string;
}

const RESOURCE_KINDS = new Set(['link', 'link_group', 'path']);

/**
 * Il contenuto di un ambito (progetto, sottoprogetto, sezione a fuoco):
 * risorse senza sezione, poi le sezioni figlie aperte. Le sezioni piu'
 * profonde sono righe che aprono la vista a fuoco: mai piu' di un livello di
 * sezioni visibile insieme (D4).
 */
export function ScopeContent({ view, workspaceId }: ScopeContentProps) {
  const { t } = useTranslation();
  const openCreate = useDialogs((state) => state.openCreate);
  const { node, children, breadcrumb } = view;

  const subprojects = children.filter((entry) => entry.node.kind === 'subproject');
  const resources = children.filter((entry) => RESOURCE_KINDS.has(entry.node.kind));
  const sections = children.filter((entry) => entry.node.kind === 'section');

  if (children.length === 0) {
    return (
      <EmptyState
        className="mt-6"
        icon={<Hash />}
        title={t('scope.emptyTitle')}
        description={t('scope.emptyDescription')}
        actions={
          <>
            {node.kind === 'project' && (
              <Button
                onClick={() => openCreate({ kind: 'subproject', parentId: node.id, workspaceId })}
              >
                <Plus />
                {t('create.title.subproject')}
              </Button>
            )}
            <Button onClick={() => openCreate({ kind: 'section', parentId: node.id, workspaceId })}>
              <Plus />
              {t('create.title.section')}
            </Button>
          </>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-7">
      {subprojects.length > 0 && (
        <section>
          <SectionTitle count={subprojects.length}>{t('scope.subprojects')}</SectionTitle>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
            {subprojects.map((entry) => (
              <SubprojectCard
                key={entry.node.id}
                entry={entry}
                chain={breadcrumb}
                workspaceId={workspaceId}
              />
            ))}
          </div>
        </section>
      )}

      {resources.length > 0 && (
        <div className={rowGrid}>
          {resources.map((entry) => (
            <NodeRow
              key={entry.node.id}
              entry={entry}
              chain={breadcrumb}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      )}

      {sections.map((entry) => (
        <SectionBlock
          key={entry.node.id}
          entry={entry}
          chain={breadcrumb}
          workspaceId={workspaceId}
        />
      ))}
    </div>
  );
}

function SubprojectCard({
  entry,
  chain,
  workspaceId,
}: {
  entry: NodeEntry;
  chain: Crumb[];
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { node } = entry;
  return (
    <button
      type="button"
      onClick={() => navigate(routeForChain(workspaceId, [...chain, node]))}
      className="bg-surface shadow-1 hover:shadow-2 flex items-center gap-3 rounded-lg p-3 text-left transition-shadow duration-120"
    >
      <span className="bg-hover flex size-8 shrink-0 items-center justify-center rounded-md">
        <NodeIcon
          kind="subproject"
          name={node.name}
          icon={node.icon}
          color={node.colorMain}
          size="sm"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-sm font-semibold">{node.name}</span>
        <span className="text-ink-3 block truncate text-xs">
          {t('kinds.count.item', { count: entry.childCount })}
        </span>
      </span>
      <ChevronRight className="text-ink-3 size-4 shrink-0" aria-hidden />
    </button>
  );
}

/** Una sezione figlia: titolo che apre la vista a fuoco, poi il suo contenuto diretto. */
function SectionBlock({
  entry,
  chain,
  workspaceId,
}: {
  entry: NodeEntry;
  chain: Crumb[];
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { node } = entry;
  const children = useChildren(node.id, entry.childCount > 0);
  const sectionChain = [...chain, node];

  return (
    <section aria-label={node.name}>
      <SectionTitle
        count={entry.childCount}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(routeForChain(workspaceId, sectionChain))}
          >
            {t('scope.focus')}
            <ChevronRight />
          </Button>
        }
      >
        <button
          type="button"
          onClick={() => navigate(routeForChain(workspaceId, sectionChain))}
          className="hover:text-ink flex items-center gap-1.5 uppercase"
        >
          {node.name}
          {node.caution && node.caution !== 'none' && (
            <span className="bg-danger-soft text-2xs text-danger flex items-center gap-1 rounded-full px-1.5 py-px font-medium tracking-normal normal-case">
              <CircleAlert className="size-3" aria-hidden />
              {t('states.caution')}
            </span>
          )}
        </button>
      </SectionTitle>

      {entry.childCount === 0 ? (
        <p className="text-ink-3 rounded-md px-3 py-3 text-sm shadow-[inset_0_0_0_1px_var(--ld-line)]">
          {t('scope.emptySection')}
        </p>
      ) : children.isLoading ? (
        <div className={rowGrid}>
          <Skeleton className="h-row" />
          <Skeleton className="h-row" />
        </div>
      ) : (
        <div className={rowGrid}>
          {(children.data ?? []).map((child) => (
            <NodeRow
              key={child.node.id}
              entry={child}
              chain={sectionChain}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      )}
    </section>
  );
}
