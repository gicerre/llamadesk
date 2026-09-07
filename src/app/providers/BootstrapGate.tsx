import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { useSessionStore } from '@/stores/sessionStore';
import { Button, Spinner } from '@/components/ui';
import { OnboardingHero } from '@/features/onboarding/OnboardingHero';
import { fadeFast } from '@/lib/motion';

/**
 * Decide cosa vede l'utente al primissimo frame:
 * caricamento → errore → onboarding → applicazione.
 */
export function BootstrapGate({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const status = useSessionStore((state) => state.status);
  const error = useSessionStore((state) => state.error);
  const isFirstRun = useSessionStore((state) => state.isFirstRun);
  const bootstrap = useSessionStore((state) => state.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={28} className="text-zinc-400" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <h1 className="text-lg font-semibold tracking-tight">{t('errors.bootstrap')}</h1>
        <p className="max-w-md font-mono text-xs text-zinc-500">{error}</p>
        <Button onClick={() => void bootstrap()}>{t('errors.retry')}</Button>
      </div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={fadeFast}
        className="h-full"
      >
        {children}
      </motion.div>
      <AnimatePresence>{isFirstRun && <OnboardingHero key="onboarding" />}</AnimatePresence>
    </>
  );
}
