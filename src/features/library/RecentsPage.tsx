import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { NodeIcon } from '@/components/NodeIcon';
import { EmptyState, ErrorPanel, Skeleton } from '@/components/ui/feedback';
import { useRecents } from '@/lib/queries';
import { PageFrame } from './parts';

/**
 * Recenti: le azioni che hanno aperto qualcosa in questo workspace. Si
 * riempiono quando le azioni di apertura esistono (fase 4); fino ad allora la
 * pagina spiega che cosa comparira'.
 */
export function RecentsPage() {
  const { t, i18n } = useTranslation();
  const { workspaceId = '' } = useParams();
  const recents = useRecents(workspaceId);
  const format = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return (
    <PageFrame className="max-w-3xl">
      <h1 className="font-display text-ink text-2xl font-semibold tracking-[-0.015em]">
        {t('nav.recents')}
      </h1>
      <div className="mt-6">
        {recents.isLoading ? (
          <Skeleton className="h-row" />
        ) : recents.isError ? (
          <ErrorPanel
            title={t('errors.recents')}
            message={String(recents.error)}
            onRetry={() => void recents.refetch()}
            retryLabel={t('common.retry')}
          />
        ) : (recents.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Clock />}
            title={t('recents.emptyTitle')}
            description={t('recents.emptyDescription')}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {(recents.data ?? []).map((recent) => (
              <li
                key={`${recent.node.id}-${recent.actionId}-${recent.toolId ?? ''}`}
                className="h-row bg-surface shadow-1 flex items-center gap-3 rounded-md px-2.5"
              >
                <span className="bg-hover flex size-8 shrink-0 items-center justify-center rounded-md">
                  <NodeIcon
                    kind={recent.node.kind}
                    name={recent.node.name}
                    icon={recent.node.icon}
                    color={recent.node.colorMain}
                    size="sm"
                  />
                </span>
                <span className="text-ink min-w-0 flex-1 truncate text-sm font-semibold">
                  {recent.node.name}
                </span>
                <time className="text-ink-3 text-xs tabular-nums" dateTime={recent.lastAt}>
                  {format.format(new Date(`${recent.lastAt.replace(' ', 'T')}Z`))}
                </time>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageFrame>
  );
}
