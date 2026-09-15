import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Ellipsis, Link2, Lock, Pin, PinOff, Plus, SlidersHorizontal, Star } from 'lucide-react';
import { NodeIcon } from '@/components/NodeIcon';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/feedback';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu';
import { api } from '@/lib/ipc';
import { invalidateLibrary, useFavorites, useNodeView, useRecents } from '@/lib/queries';
import { routeForChain } from '@/lib/routes';
import { useDialogs } from '@/stores/dialogs';
import { useInspector } from '@/stores/inspector';
import { useProfileId } from '@/stores/session';
import { toastError } from '@/stores/toasts';
import type { Favorite } from '@/types/generated/Favorite';
import type { NodeEntry } from '@/types/generated/NodeEntry';
import type { NodeView } from '@/types/generated/NodeView';
import type { RecentAction } from '@/types/generated/RecentAction';
import { NodeMenu } from '../library/NodeMenu';
import { HeaderSkeleton, MissingNode, NodeHeader, PageFrame, SectionTitle } from '../library/parts';
import { ScopeContent } from '../project/ScopeContent';
import { rerun, useRecentDescription } from '../actions/recents';
import { isExecutable } from '../actions/registry';
import { runAction } from '../actions/run';

/**
 * Home del workspace (D6): tre domande, tre fasce. "Cosa stavo usando?"
 * (Continua), "Dove posso andare?" (Progetti), "Cosa uso piu' spesso?"
 * (Preferiti in questo workspace). Poi le risorse sciolte del workspace.
 * Le fasce vuote non si disegnano.
 */
export function WorkspacePage() {
  const { t } = useTranslation();
  const { workspaceId = '' } = useParams();
  const view = useNodeView(workspaceId, workspaceId);
  const openAdd = useDialogs((state) => state.openAdd);

  if (view.isError) {
    return <MissingNode message={t('errors.workspaceMissing')} workspaceId={null} />;
  }

  return (
    <PageFrame>
      {view.data ? (
        <NodeHeader
          view={view.data}
          workspaceId={workspaceId}
          actions={
            <>
              <Button
                variant="primary"
                onClick={() => openAdd({ parentId: workspaceId, workspaceId })}
              >
                <Plus />
                {t('add.title')}
              </Button>
              <NodeMenu view={view.data} workspaceId={workspaceId} />
            </>
          }
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
  const recents = useRecents(workspaceId);
  const favorites = useFavorites();

  // Fissati prima, poi nell'ordine scelto.
  const projects = view.children
    .filter((entry) => entry.node.kind === 'project')
    .sort((a, b) => Number(b.isPinned) - Number(a.isPinned));
  const others = view.children.filter((entry) => entry.node.kind !== 'project');
  const continuing = (recents.data ?? []).slice(0, 6);
  const favoritesHere = (favorites.data ?? []).filter((favorite) =>
    favorite.workspaceIds.includes(workspaceId),
  );
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
    <div className="mt-8 flex flex-col gap-9">
      {continuing.length > 0 && (
        <section aria-labelledby="continue-title">
          <SectionTitle>
            <span id="continue-title">{t('home.continue')}</span>
          </SectionTitle>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            {continuing.map((recent) => (
              <ContinueCard
                key={`${recent.node.id}-${recent.actionId}-${recent.toolId ?? ''}`}
                recent={recent}
                workspaceId={workspaceId}
              />
            ))}
          </div>
        </section>
      )}

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

      {favoritesHere.length > 0 && (
        <section aria-labelledby="favorites-title">
          <SectionTitle count={favoritesHere.length}>
            <span id="favorites-title">{t('home.favoritesHere', { name: view.node.name })}</span>
          </SectionTitle>
          <ul className="flex flex-wrap gap-2">
            {favoritesHere.map((favorite) => (
              <FavoriteChip
                key={`${favorite.node.id}-${favorite.actionId ?? ''}`}
                favorite={favorite}
                workspaceId={workspaceId}
              />
            ))}
          </ul>
        </section>
      )}

      {others.length > 0 && (
        <section aria-labelledby="loose-title">
          <SectionTitle>
            <span id="loose-title">{t('workspace.resources')}</span>
          </SectionTitle>
          <ScopeContent view={view} workspaceId={workspaceId} exclude={['project']} />
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
  const openInspector = useInspector((state) => state.open);
  const { node } = entry;

  const setPinned = async (pinned: boolean) => {
    try {
      await api.setPinned(workspaceId, node.id, pinned);
      await invalidateLibrary();
    } catch (error) {
      toastError(t('home.pinFailed'), error);
    }
  };

  return (
    <div className="group/card relative">
      <button
        type="button"
        onClick={() => navigate(routeForChain(workspaceId, [...view.breadcrumb, node]))}
        className="bg-surface shadow-1 hover:shadow-2 flex min-h-[116px] w-full flex-col rounded-lg p-3.5 text-left transition-shadow duration-120"
      >
        <span className="flex items-start gap-3">
          <NodeIcon
            kind="project"
            name={node.name}
            icon={node.icon}
            color={node.colorMain}
            size="md"
          />
          <span className="text-ink-3 mr-7 ml-auto flex items-center gap-1">
            {entry.isPinned && <Pin className="size-3.5" aria-label={t('home.pinned')} />}
            {entry.parentCount > 1 && (
              <Link2 className="size-3.5" aria-label={t('states.shared')} />
            )}
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
      <Menu>
        <MenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t('actions.more')}
            className="absolute top-2.5 right-2.5 opacity-0 group-focus-within/card:opacity-100 group-hover/card:opacity-100 data-[state=open]:opacity-100"
          >
            <Ellipsis />
          </Button>
        </MenuTrigger>
        <MenuContent align="end">
          <MenuItem
            icon={entry.isPinned ? <PinOff /> : <Pin />}
            onSelect={() => void setPinned(!entry.isPinned)}
          >
            {entry.isPinned ? t('home.unpin') : t('home.pin')}
          </MenuItem>
          <MenuItem
            icon={<SlidersHorizontal />}
            onSelect={() => openInspector(node.id, workspaceId)}
          >
            {t('inspector.open')}
          </MenuItem>
        </MenuContent>
      </Menu>
    </div>
  );
}

/** Un'azione recente: il clic la ripete identica (stesso strumento, stesso workspace). */
function ContinueCard({ recent, workspaceId }: { recent: RecentAction; workspaceId: string }) {
  const { i18n } = useTranslation();
  const describe = useRecentDescription();
  const { node } = recent;
  // L'istante di riferimento si fissa al montaggio: il rendering resta puro.
  const [now] = useState(() => Date.now());
  const relative = relativeTime(recent.lastAt, now, i18n.language);

  return (
    <button
      type="button"
      onClick={() => void rerun(recent, workspaceId)}
      className="bg-surface shadow-1 hover:shadow-2 flex flex-col gap-2 rounded-lg p-3 text-left transition-shadow duration-120"
    >
      <NodeIcon
        kind={node.kind}
        name={node.name}
        icon={node.icon}
        color={node.colorMain}
        size="sm"
      />
      <span className="min-w-0">
        <span className="text-ink block truncate text-sm font-semibold">{node.name}</span>
        <span className="text-ink-3 block truncate text-xs">
          {describe(recent)} · {relative}
        </span>
      </span>
    </button>
  );
}

function FavoriteChip({ favorite, workspaceId }: { favorite: Favorite; workspaceId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profileId = useProfileId();
  const { node } = favorite;

  const open = async () => {
    if (isExecutable(node.kind)) {
      void runAction({ node, actionId: 'open', workspaceId });
      return;
    }
    try {
      const view = await api.nodeView(profileId, node.id, workspaceId);
      navigate(routeForChain(workspaceId, view.breadcrumb));
    } catch (error) {
      toastError(t('errors.nodeMissing'), error);
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={() => void open()}
        className="bg-surface text-ink shadow-1 hover:shadow-2 flex h-8 items-center gap-2 rounded-full pr-3 pl-1.5 text-sm transition-shadow duration-120"
      >
        <Star className="fill-caution text-caution size-3.5" aria-hidden />
        <NodeIcon
          kind={node.kind}
          name={node.name}
          icon={node.icon}
          color={node.colorMain}
          size="xs"
        />
        <span className="max-w-48 truncate font-medium">{node.name}</span>
      </button>
    </li>
  );
}

/** "12 minuti fa", "ieri": l'ora SQLite e' UTC senza fuso. */
function relativeTime(sqliteUtc: string, now: number, locale: string) {
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const minutes = Math.round((Date.parse(`${sqliteUtc.replace(' ', 'T')}Z`) - now) / 60_000);
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  if (Math.abs(minutes) < 1440) return format.format(Math.round(minutes / 60), 'hour');
  return format.format(Math.round(minutes / 1440), 'day');
}
