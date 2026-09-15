import { Navigate } from 'react-router-dom';
import { BrandMark } from '@/components/brand/BrandMark';
import { ErrorPanel } from '@/components/ui/feedback';
import { useTranslation } from 'react-i18next';
import { useWorkspaces } from '@/lib/queries';
import { paths } from '@/lib/routes';

/**
 * L'ingresso: il workspace predefinito del profilo, dalla pagina in cui lo si
 * era lasciato. Senza workspace si passa dal benvenuto.
 */
export function RootRedirect() {
  const { t } = useTranslation();
  const workspaces = useWorkspaces();

  if (workspaces.isLoading) {
    return (
      <div className="bg-canvas flex h-full items-center justify-center">
        <BrandMark size={56} />
      </div>
    );
  }

  if (workspaces.isError) {
    return (
      <div className="bg-canvas flex h-full items-center justify-center p-8">
        <div className="w-full max-w-lg">
          <ErrorPanel
            title={t('errors.workspaces')}
            message={String(workspaces.error)}
            onRetry={() => void workspaces.refetch()}
            retryLabel={t('common.retry')}
          />
        </div>
      </div>
    );
  }

  const list = workspaces.data ?? [];
  const target = list.find((entry) => entry.isDefault) ?? list[0];
  if (!target) return <Navigate to={paths.welcome} replace />;

  const home = paths.workspace(target.node.id);
  // Solo un indirizzo di quel workspace e' un punto di ripartenza valido.
  const resume = target.lastRoute?.startsWith(home) ? target.lastRoute : home;
  return <Navigate to={resume} replace />;
}
