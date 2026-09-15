import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorPanel } from '@/components/ui/feedback';
import { api, isTauri } from '@/lib/ipc';
import { useSession } from '@/stores/session';
import { applyAppearance } from './appearance';
import { Opener } from './Opener';

/**
 * Primo fotogramma: il fondo del tema, finche' il backend non risponde
 * (millisecondi). Appena dipinto, la finestra puo' comparire: niente lampi.
 * Poi la shell, con sopra l'animazione di apertura se e' il caso.
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
    // Due fotogrammi: il primo applica gli stili, il secondo e' dipinto.
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (isTauri()) void api.windowReady().catch(() => undefined);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [bootstrap]);

  if (status === 'loading') {
    return <div className="bg-canvas h-full" />;
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

  return (
    <>
      {children}
      <Opener />
    </>
  );
}
