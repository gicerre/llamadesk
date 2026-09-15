import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, Ellipsis } from 'lucide-react';
import { NodeIcon } from '@/components/NodeIcon';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import { useChildren, useNodeView } from '@/lib/queries';
import { paths, routeForChain } from '@/lib/routes';
import type { Crumb } from '@/types/generated/Crumb';
import { useLocationContext } from './context';

/** Oltre questa lunghezza i tratti centrali finiscono in un menu "…". */
const MAX_VISIBLE = 5;

/**
 * Percorso nella barra del titolo: "Lavoro ▾ › SpecialHub ▾ › Backend ▾".
 * Ogni tratto porta al suo livello; la freccia apre i fratelli, per passare
 * da Backend a Frontend senza risalire.
 */
export function PathBar() {
  const { t } = useTranslation();
  const { pathname, workspace, workspaceId, nodeId } = useLocationContext();
  const view = useNodeView(nodeId, workspaceId);

  // Pagine che non sono un punto della gerarchia: workspace + nome della pagina.
  const pageTitle = pathname.endsWith('/preferiti')
    ? t('nav.favorites')
    : pathname.endsWith('/recenti')
      ? t('nav.recents')
      : pathname === paths.settings
        ? t('nav.settings')
        : null;

  const chain: Crumb[] = pageTitle
    ? workspace && pathname !== paths.settings
      ? [{ ...workspace.node, colorMain: workspace.node.colorMain }]
      : []
    : (view.data?.breadcrumb ?? []);

  if (!workspaceId || (chain.length === 0 && !pageTitle)) {
    return <nav aria-label={t('shell.path')} className="min-w-0" />;
  }

  const hidden = chain.length > MAX_VISIBLE ? chain.slice(1, chain.length - 2) : [];
  const visible =
    hidden.length > 0 ? [chain[0] as Crumb, null, ...chain.slice(chain.length - 2)] : chain;

  return (
    <nav aria-label={t('shell.path')} className="flex min-w-0 items-center">
      <ol className="flex min-w-0 items-center gap-0.5">
        {visible.map((crumb, index) => {
          const isLast = index === visible.length - 1 && !pageTitle;
          return (
            <Fragment key={crumb?.id ?? 'hidden'}>
              {index > 0 && <ChevronRight className="text-ink-3 size-3.5 shrink-0" aria-hidden />}
              <li className="flex min-w-0 items-center">
                {crumb ? (
                  <CrumbButton
                    crumb={crumb}
                    chain={chain}
                    workspaceId={workspaceId}
                    current={isLast}
                  />
                ) : (
                  <HiddenCrumbs crumbs={hidden} chain={chain} workspaceId={workspaceId} />
                )}
              </li>
            </Fragment>
          );
        })}
        {pageTitle && (
          <>
            {chain.length > 0 && (
              <ChevronRight className="text-ink-3 size-3.5 shrink-0" aria-hidden />
            )}
            <li aria-current="page" className="text-ink truncate px-1.5 text-sm font-semibold">
              {pageTitle}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}

interface CrumbButtonProps {
  crumb: Crumb;
  chain: Crumb[];
  workspaceId: string;
  current: boolean;
}

function CrumbButton({ crumb, chain, workspaceId, current }: CrumbButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const position = chain.findIndex((entry) => entry.id === crumb.id);
  const target =
    crumb.kind === 'workspace'
      ? paths.workspace(crumb.id)
      : routeForChain(workspaceId, chain.slice(0, position + 1));

  return (
    <span className="group hover:bg-hover flex min-w-0 items-center rounded-sm">
      <button
        type="button"
        aria-current={current ? 'page' : undefined}
        onClick={() => navigate(target)}
        className={cn(
          'flex h-7 min-w-0 items-center gap-1.5 rounded-l-sm pl-1.5 text-sm',
          current ? 'text-ink font-semibold' : 'text-ink-2 hover:text-ink',
        )}
      >
        <NodeIcon
          kind={crumb.kind}
          name={crumb.name}
          icon={crumb.icon}
          color={crumb.colorMain}
          size="xs"
        />
        <span className="max-w-44 truncate">{crumb.name}</span>
      </button>
      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label={t('shell.siblings', { name: crumb.name })}
            className="text-ink-3 hover:text-ink data-[state=open]:bg-press flex h-7 w-5 items-center justify-center rounded-r-sm"
          >
            <ChevronDown className="size-3" />
          </button>
        </MenuTrigger>
        <MenuContent>
          <SiblingItems crumb={crumb} chain={chain} workspaceId={workspaceId} />
        </MenuContent>
      </Menu>
    </span>
  );
}

/** I fratelli si caricano solo quando il menu si apre. */
function SiblingItems({ crumb, chain, workspaceId }: Omit<CrumbButtonProps, 'current'>) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workspaces } = useLocationContext();
  const position = chain.findIndex((entry) => entry.id === crumb.id);
  const parent = position > 0 ? chain[position - 1] : undefined;
  const children = useChildren(parent?.id, crumb.kind !== 'workspace');

  if (crumb.kind === 'workspace') {
    return workspaces.map((entry) => (
      <MenuItem
        key={entry.node.id}
        selected={entry.node.id === crumb.id}
        icon={
          <NodeIcon
            kind="workspace"
            name={entry.node.name}
            icon={entry.node.icon}
            color={entry.node.colorMain}
            size="sm"
          />
        }
        onSelect={() => navigate(entry.lastRoute ?? paths.workspace(entry.node.id))}
      >
        {entry.node.name}
      </MenuItem>
    ));
  }

  const siblings = (children.data ?? []).filter((entry) => entry.node.kind === crumb.kind);
  if (children.isLoading) {
    return <p className="text-ink-3 px-2 py-1.5 text-xs">{t('common.loading')}</p>;
  }

  return siblings.map((entry) => (
    <MenuItem
      key={entry.node.id}
      selected={entry.node.id === crumb.id}
      icon={
        <NodeIcon
          kind={entry.node.kind}
          name={entry.node.name}
          icon={entry.node.icon}
          color={entry.node.colorMain}
          size="sm"
        />
      }
      onSelect={() =>
        navigate(routeForChain(workspaceId, [...chain.slice(0, position), entry.node]))
      }
    >
      {entry.node.name}
    </MenuItem>
  ));
}

function HiddenCrumbs({
  crumbs,
  chain,
  workspaceId,
}: {
  crumbs: Crumb[];
  chain: Crumb[];
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={t('shell.hiddenPath')}
          className="text-ink-3 hover:bg-hover hover:text-ink flex h-7 w-7 items-center justify-center rounded-sm"
        >
          <Ellipsis className="size-4" />
        </button>
      </MenuTrigger>
      <MenuContent>
        {crumbs.map((crumb) => (
          <MenuItem
            key={crumb.id}
            icon={
              <NodeIcon
                kind={crumb.kind}
                name={crumb.name}
                icon={crumb.icon}
                color={crumb.colorMain}
                size="sm"
              />
            }
            onSelect={() =>
              navigate(
                routeForChain(
                  workspaceId,
                  chain.slice(0, chain.findIndex((entry) => entry.id === crumb.id) + 1),
                ),
              )
            }
          >
            {crumb.name}
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
}
