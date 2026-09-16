import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BrandMark } from '@/components/brand/BrandMark';
import { cn } from '@/lib/cn';
import { duration, easeOut } from '@/lib/motion';
import { useWorkspaces } from '@/lib/queries';
import { paths } from '@/lib/routes';
import { useSession } from '@/stores/session';
import { WindowControls } from '@/app/shell/WindowControls';
import { ProfileStep } from './ProfileStep';
import { TourStep } from './TourStep';
import { WorkspaceStep } from './WorkspaceStep';

/* ============================================================================
   Primo avvio: una sola pagina che accompagna dalla presentazione al primo
   workspace, invece di scaricare l'utente sulla schermata vuota.

     profilo → (tour) → workspace → applicazione

   Si arriva qui anche quando un profilo creato dopo non vede ancora nessun
   workspace: in quel caso profilo e tour sono gia' fatti e si parte dall'ultimo
   passo. Alla fine `firstRun` viene consumato e non si torna piu' indietro.
   ========================================================================== */

export type OnboardingStep = 'profile' | 'tour' | 'workspace';

export function OnboardingFlow() {
  const navigate = useNavigate();
  const isFirstRun = useSession((state) => state.isFirstRun);
  const completeWelcome = useSession((state) => state.completeWelcome);
  const workspaces = useWorkspaces();
  const [step, setStep] = useState<OnboardingStep>(isFirstRun ? 'profile' : 'workspace');

  // Un profilo che ha gia' i suoi workspace non ha niente da configurare.
  if ((workspaces.data ?? []).length > 0) return <Navigate to={paths.root} replace />;

  const finish = async (workspaceId: string) => {
    if (isFirstRun) await completeWelcome();
    navigate(paths.workspace(workspaceId), { replace: true });
  };

  return (
    <div className="bg-canvas flex h-full flex-col">
      <header data-tauri-drag-region className="flex h-10 shrink-0 items-center gap-3 pr-0 pl-4">
        <BrandMark size={18} decorative />
        {isFirstRun && <Progress step={step} />}
        <span data-tauri-drag-region className="flex-1" />
        <WindowControls />
      </header>

      <main className="flex min-h-0 flex-1 justify-center overflow-y-auto px-6 pt-[6vh] pb-12">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: duration.page, ease: easeOut }}
            className="w-full max-w-[560px]"
          >
            {step === 'profile' && <ProfileStep onDone={() => setStep('tour')} />}
            {step === 'tour' && <TourStep onDone={() => setStep('workspace')} />}
            {step === 'workspace' && (
              <WorkspaceStep first={isFirstRun} onCreated={(id) => void finish(id)} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

/** Tre passi, tre trattini: dove si e' arrivati, senza numeri da leggere. */
function Progress({ step }: { step: OnboardingStep }) {
  const { t } = useTranslation();
  const steps: OnboardingStep[] = ['profile', 'tour', 'workspace'];
  const current = steps.indexOf(step);

  return (
    <span className="flex items-center gap-1.5" aria-hidden>
      {steps.map((name, index) => (
        <span
          key={name}
          className={cn(
            'h-1 rounded-full transition-all duration-200 ease-out',
            index <= current ? 'bg-accent w-6' : 'bg-line-strong w-3',
          )}
        />
      ))}
      <span className="sr-only">{t(`onboarding.steps.${step}`)}</span>
    </span>
  );
}

/** Intestazione comune ai passi: titolo grande, una riga di spiegazione. */
export function StepHeader({ title, lead }: { title: string; lead: string }) {
  return (
    <header className="mb-7">
      <h1 className="font-display text-ink text-[26px] leading-tight font-semibold tracking-[-0.02em] text-balance">
        {title}
      </h1>
      <p className="text-ink-2 mt-2 text-base text-balance">{lead}</p>
    </header>
  );
}

/** Riga di chiusura di un passo: azione principale a destra. */
export function StepActions({
  secondary,
  children,
}: {
  secondary?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-7 flex items-center gap-2">
      {secondary}
      <span className="flex-1" />
      {children}
    </div>
  );
}
