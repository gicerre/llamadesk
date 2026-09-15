import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, CircleAlert, Link2, Lock, ShieldAlert, Star } from 'lucide-react';
import { Cover } from '@/components/Cover';
import { NodeIcon } from '@/components/NodeIcon';
import { Button } from '@/components/ui/Button';
import { ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { Tip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { useToggleFavorite } from '@/lib/queries';
import { paths, routeForChain } from '@/lib/routes';
import { toastError } from '@/stores/toasts';
import type { Crumb } from '@/types/generated/Crumb';
import type { NodeEntry } from '@/types/generated/NodeEntry';
import type { NodeView } from '@/types/generated/NodeView';

/* ============================================================================
   Pezzi comuni alle pagine della libreria: cornice, intestazione, righe.
   La ricchezza delle righe (azioni, tipi di percorso, gruppi a pila) arriva
   con le fasi 3 e 4; qui c'e' la struttura su cui cresceranno.
   ========================================================================== */

export function PageFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto flex w-full max-w-[1280px] flex-col px-7 pt-6 pb-16', className)}>
      {children}
    </div>
  );
}

interface NodeHeaderProps {
  view: NodeView;
  workspaceId: string;
  actions?: React.ReactNode;
}

/** Intestazione di workspace, progetto e sezione a fuoco. */
export function NodeHeader({ view, workspaceId, actions }: NodeHeaderProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toggleFavorite = useToggleFavorite();
  const { node, protection, caution } = view;
  const otherWorkspaces = view.workspaces.filter((crumb) => crumb.id !== workspaceId);
  const large = node.kind === 'workspace' || node.kind === 'project';

  const cover = !view.locked && node.coverAssetId && (
    <Cover node={node} className="-mx-7 -mt-6 mb-5 h-44 rounded-b-xl" />
  );

  return (
    <>
      {cover}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <NodeIcon
          kind={node.kind}
          name={node.name}
          icon={node.icon}
          color={node.colorMain}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <h1
            className={cn(
              'font-display text-ink truncate font-semibold tracking-[-0.015em]',
              large ? 'text-2xl' : 'text-xl',
            )}
          >
            {node.name}
          </h1>
          <div className="text-ink-3 mt-1 flex flex-wrap items-center gap-2 text-sm">
            {node.description && <span className="selectable truncate">{node.description}</span>}
            {node.kind === 'project' && otherWorkspaces.length > 0 && (
              <Chip icon={<Link2 />}>
                {t('states.alsoIn')}
                {otherWorkspaces.map((crumb, index) => (
                  <button
                    key={crumb.id}
                    type="button"
                    // Stesso progetto, visto dall'altro workspace.
                    onClick={() => navigate(routeForChain(crumb.id, view.breadcrumb))}
                    className="text-ink-2 hover:text-ink font-semibold hover:underline"
                  >
                    {index > 0 ? `, ${crumb.name}` : crumb.name}
                  </button>
                ))}
              </Chip>
            )}
            {protection.isProtected && (
              <Chip icon={<Lock />}>
                {protection.isOwn
                  ? t('states.protected')
                  : t('states.protectedBy', { name: protection.inheritedFrom?.name ?? '' })}
              </Chip>
            )}
            {caution.level !== 'none' && (
              <Chip icon={<ShieldAlert />} tone="danger">
                {caution.isOwn
                  ? t('states.caution')
                  : t('states.cautionBy', { name: caution.inheritedFrom?.name ?? '' })}
              </Chip>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!view.locked && (
            <Tip label={view.isFavorite ? t('actions.unfavorite') : t('actions.favorite')}>
              <Button
                variant="ghost"
                iconOnly
                aria-pressed={view.isFavorite}
                aria-label={view.isFavorite ? t('actions.unfavorite') : t('actions.favorite')}
                onClick={() =>
                  toggleFavorite.mutate(node.id, {
                    onError: (error) => toastError(t('actions.favoriteFailed'), error),
                  })
                }
              >
                <Star className={cn(view.isFavorite && 'fill-caution text-caution')} />
              </Button>
            </Tip>
          )}
          {actions}
        </div>
      </header>
    </>
  );
}

export function Chip({
  icon,
  children,
  tone = 'neutral',
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <span
      className={cn(
        'text-2xs inline-flex h-5 items-center gap-1 rounded-full px-2 font-medium [&_svg]:size-3',
        tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-hover text-ink-2',
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function HeaderSkeleton() {
  return (
    <div className="flex items-center gap-4" aria-busy>
      <Skeleton className="size-11 rounded-[11px]" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-3.5 w-36" />
      </div>
    </div>
  );
}

/** Un elemento non trovato o non visibile: si spiega e si offre la strada di casa. */
export function MissingNode({
  message,
  workspaceId,
}: {
  message: string;
  workspaceId: string | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <PageFrame className="max-w-2xl pt-16">
      <ErrorPanel
        title={t('errors.missingTitle')}
        message={message}
        onRetry={() => navigate(workspaceId ? paths.workspace(workspaceId) : paths.root)}
        retryLabel={t('errors.backHome')}
      />
    </PageFrame>
  );
}

export function SectionTitle({
  children,
  count,
  actions,
}: {
  children: React.ReactNode;
  count?: number;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex h-7 items-center gap-2">
      <h2 className="text-2xs text-ink-3 font-semibold tracking-[0.08em] uppercase">{children}</h2>
      {count !== undefined && <span className="text-2xs text-ink-3 tabular-nums">{count}</span>}
      <div className="ml-auto flex items-center gap-1">{actions}</div>
    </div>
  );
}

/** Secondo rigo di una risorsa: dove punta. */
function locator(entry: NodeEntry, t: (key: string, options?: Record<string, unknown>) => string) {
  const { node } = entry;
  if (node.kind === 'link') return node.url?.replace(/^https?:\/\//, '') ?? '';
  if (node.kind === 'path') return node.path ?? '';
  if (node.kind === 'link_group') return t('kinds.count.link', { count: entry.childCount });
  return t('kinds.count.item', { count: entry.childCount });
}

interface ResourceRowProps {
  entry: NodeEntry;
  /** Percorso fino al contenitore della riga, per costruire l'indirizzo. */
  chain: Crumb[];
  workspaceId: string;
}

/**
 * Riga di una risorsa o di una sezione profonda. Le sezioni aprono la vista a
 * fuoco; le risorse, per ora, non fanno nulla al clic: le azioni di apertura
 * arrivano con la fase 4, e la riga non finge di saperle eseguire.
 */
export function NodeRow({ entry, chain, workspaceId }: ResourceRowProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { node } = entry;
  const navigable =
    node.kind === 'section' || node.kind === 'subproject' || node.kind === 'project';
  const target = navigable ? routeForChain(workspaceId, [...chain, node]) : null;

  const content = (
    <>
      <span className="bg-hover flex size-8 shrink-0 items-center justify-center rounded-md">
        <NodeIcon
          kind={node.kind}
          name={node.name}
          icon={node.icon}
          color={node.colorMain}
          size="sm"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink flex items-center gap-1.5 truncate text-sm font-semibold">
          {node.name}
          {node.isProtected && (
            <Lock className="text-ink-3 size-3" aria-label={t('states.protected')} />
          )}
          {node.caution && node.caution !== 'none' && (
            <CircleAlert className="text-danger size-3" aria-label={t('states.caution')} />
          )}
        </span>
        <span className="selectable text-2xs text-ink-3 block truncate font-mono">
          {locator(entry, t)}
        </span>
      </span>
      {target && <ChevronRight className="text-ink-3 size-4 shrink-0" aria-hidden />}
    </>
  );

  const rowClass =
    'flex h-row w-full min-w-0 items-center gap-3 rounded-md bg-surface px-2.5 text-left shadow-1';

  return target ? (
    <button
      type="button"
      onClick={() => navigate(target)}
      className={cn(rowClass, 'hover:shadow-2 transition-shadow duration-120')}
    >
      {content}
    </button>
  ) : (
    <div className={rowClass}>{content}</div>
  );
}

export const rowGrid = 'grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3';
