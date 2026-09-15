import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BrandMark } from '@/components/brand/BrandMark';
import { ErrorPanel } from '@/components/ui/feedback';
import { useSession } from '@/stores/session';
import { applyAppearance } from './appearance';

/**
 * Primo fotogramma: il simbolo sul fondo del tema, finche' il backend non
 * risponde (millisecondi). Nessuno spinner. L'animazione di apertura vera
 * arriva con la fase 7 e si innestera' qui.
 */
export function BootstrapGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const status = useSession((state) => state.status);
  const error = useSession((state) => state.error);
  const bootstrap = useSession((state) => state.bootstrap);

  useEffect(() => {
    // Tema di sistema subito, prima ancora di conoscere le impostazioni.
    applyAppearance({ theme: 'system', density: 'comfortable', material: 'solid' });
    void bootstrap();
  }, [bootstrap]);

  if (status === 'loading') {
    return (
      <div className="bg-canvas flex h-full items-center justify-center">
        <BrandMark size={56} />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="bg-canvas flex h-full items-center justify-center p-8">
        <div className="w-full max-w-lg">
          <ErrorPanel
            title={t('errors.bootstrap')}
            message={error ?? ''}
            onRetry={() => void bootstrap()}
            retryLabel={t('common.retry')}
          />
        </div>
      </div>
    );
  }

  return children;
}
