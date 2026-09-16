import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { duration, easeOut } from '@/lib/motion';
import { StepActions, StepHeader } from './OnboardingFlow';
import { PaletteDemo, ProjectsDemo, SafetyDemo, ToolsDemo, WorkspacesDemo } from './demos';

/** L'ordine del giro: dal contenitore piu' grande al dettaglio che protegge. */
const DEMOS = {
  workspaces: WorkspacesDemo,
  projects: ProjectsDemo,
  tools: ToolsDemo,
  palette: PaletteDemo,
  safety: SafetyDemo,
} as const;

type DemoId = keyof typeof DEMOS;

/**
 * Secondo passo, facoltativo: un giro di cinque schermi su cio' che l'app sa
 * fare davvero. Ogni schermo mostra il gesto, non lo descrive soltanto: si
 * esce quando si vuole, e frecce e puntini dicono dove si e' arrivati.
 */
export function TourStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const slides = Object.keys(DEMOS) as DemoId[];
  const last = index === slides.length - 1;

  useEffect(() => {
    if (!started) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight')
        setIndex((current) => Math.min(current + 1, slides.length - 1));
      if (event.key === 'ArrowLeft') setIndex((current) => Math.max(current - 1, 0));
      if (event.key === 'Escape') onDone();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [started, slides.length, onDone]);

  if (!started) {
    return (
      <div>
        <StepHeader title={t('onboarding.tour.askTitle')} lead={t('onboarding.tour.askLead')} />
        {/* L'indice del giro: si sa che cosa si sta per vedere, e quanto dura. */}
        <ol className="bg-surface shadow-1 flex flex-col rounded-xl px-5 py-2">
          {slides.map((name, position) => (
            <motion.li
              key={name}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: position * 0.06, duration: duration.page, ease: easeOut }}
              className="flex h-11 items-center gap-3"
            >
              <span className="text-2xs text-ink-3 w-4 shrink-0 font-mono">{position + 1}</span>
              <span className="text-ink truncate text-sm">
                {t(`onboarding.tour.slides.${name}.title`)}
              </span>
            </motion.li>
          ))}
        </ol>
        <StepActions
          secondary={
            <Button variant="ghost" size="lg" onClick={onDone}>
              {t('onboarding.tour.skip')}
            </Button>
          }
        >
          <Button variant="primary" size="lg" autoFocus onClick={() => setStarted(true)}>
            <Play />
            {t('onboarding.tour.start')}
          </Button>
        </StepActions>
      </div>
    );
  }

  const slide = slides[index] as DemoId;
  const Demo = DEMOS[slide];

  return (
    <div>
      <div className="bg-surface shadow-1 overflow-hidden rounded-xl">
        <div className="bg-sunken/40 flex h-[232px] items-center justify-center px-6">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={slide}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: duration.tab, ease: easeOut }}
              className="w-full"
            >
              <Demo />
            </motion.div>
          </AnimatePresence>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={slide}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.page, ease: easeOut }}
            className="px-5 py-4"
          >
            <h2 className="font-display text-ink text-lg font-semibold">
              {t(`onboarding.tour.slides.${slide}.title`)}
            </h2>
            <p className="text-ink-2 mt-1 text-sm text-balance">
              {t(`onboarding.tour.slides.${slide}.text`)}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <StepActions
        secondary={
          <>
            <Button variant="ghost" onClick={onDone}>
              {t('onboarding.tour.skip')}
            </Button>
            <span className="ml-2 flex items-center gap-1.5" aria-hidden>
              {slides.map((name, position) => (
                <span
                  key={name}
                  className={cn(
                    'size-1.5 rounded-full transition-colors duration-120',
                    position === index ? 'bg-accent' : 'bg-line-strong',
                  )}
                />
              ))}
            </span>
          </>
        }
      >
        <Button
          variant="ghost"
          iconOnly
          aria-label={t('onboarding.tour.previous')}
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          <ArrowLeft />
        </Button>
        <Button variant="primary" size="lg" onClick={() => (last ? onDone() : setIndex(index + 1))}>
          {last ? t('onboarding.tour.finish') : t('onboarding.tour.next')}
          {!last && <ArrowRight />}
        </Button>
      </StepActions>
    </div>
  );
}
