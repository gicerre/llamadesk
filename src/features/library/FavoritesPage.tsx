import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Star } from 'lucide-react';
import { NodeIcon } from '@/components/NodeIcon';
import { EmptyState, ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { Segmented } from '@/components/ui/fields';
import { api } from '@/lib/ipc';
import { useFavorites } from '@/lib/queries';
import { routeForChain } from '@/lib/routes';
import { useProfileId } from '@/stores/session';
import { toastError } from '@/stores/toasts';
import type { Favorite } from '@/types/generated/Favorite';
import { PageFrame } from './parts';

/**
 * Preferiti del profilo (docs/REDESIGN.md, "Recenti e preferiti"): quelli del
 * workspace corrente, oppure tutti. Un preferito porta al punto in cui vive.
 */
export function FavoritesPage() {
  const { t } = useTranslation();
  const { workspaceId = '' } = useParams();
  const favorites = useFavorites();
  const [scope, setScope] = useState<'here' | 'all'>('here');

  const list = (favorites.data ?? []).filter(
    (favorite) => scope === 'all' || favorite.workspaceIds.includes(workspaceId),
  );

  return (
    <PageFrame className="max-w-3xl">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-ink flex-1 text-2xl font-semibold tracking-[-0.015em]">
          {t('nav.favorites')}
        </h1>
        <Segmented
          label={t('favorites.scope')}
          value={scope}
          onChange={setScope}
          options={[
            { value: 'here', label: t('favorites.here') },
            { value: 'all', label: t('favorites.all') },
          ]}
        />
      </header>

      <div className="mt-6">
        {favorites.isLoading ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-row" />
            <Skeleton className="h-row" />
          </div>
        ) : favorites.isError ? (
          <ErrorPanel
            title={t('errors.favorites')}
            message={String(favorites.error)}
            onRetry={() => void favorites.refetch()}
            retryLabel={t('common.retry')}
          />
        ) : list.length === 0 ? (
          <EmptyState
            icon={<Star />}
            title={t('favorites.emptyTitle')}
            description={t('favorites.emptyDescription')}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((favorite) => (
              <FavoriteRow
                key={`${favorite.node.id}-${favorite.actionId ?? ''}`}
                favorite={favorite}
                workspaceId={
                  favorite.workspaceIds.includes(workspaceId)
                    ? workspaceId
                    : (favorite.workspaceIds[0] ?? workspaceId)
                }
              />
            ))}
          </ul>
        )}
      </div>
    </PageFrame>
  );
}

function FavoriteRow({ favorite, workspaceId }: { favorite: Favorite; workspaceId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profileId = useProfileId();
  const { node } = favorite;

  // Il percorso serve solo al clic: non vale una lettura per ogni riga.
  const open = async () => {
    try {
      const view = await api.nodeView(profileId, node.id, workspaceId);
      // Una risorsa si mostra dentro il suo contenitore.
      const chain = ['link', 'link_group', 'path'].includes(node.kind)
        ? view.breadcrumb.slice(0, -1)
        : view.breadcrumb;
      navigate(routeForChain(workspaceId, chain));
    } catch (error) {
      toastError(t('errors.nodeMissing'), error);
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={() => void open()}
        className="h-row bg-surface shadow-1 hover:shadow-2 flex w-full items-center gap-3 rounded-md px-2.5 text-left transition-shadow duration-120"
      >
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
          <span className="text-ink block truncate text-sm font-semibold">{node.name}</span>
          <span className="text-ink-3 block truncate text-xs">{t(`kinds.one.${node.kind}`)}</span>
        </span>
        <ChevronRight className="text-ink-3 size-4" aria-hidden />
      </button>
    </li>
  );
}
