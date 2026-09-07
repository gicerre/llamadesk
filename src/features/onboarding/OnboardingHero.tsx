import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { HardDrive, EyeOff, Sparkles } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui';
import { useSessionStore } from '@/stores/sessionStore';
import { springBouncy, springGentle } from '@/lib/motion';

/** I tre pilastri della filosofia dell'app, dichiarati prima di ogni altra cosa. */
const PILLARS = [
  { icon: HardDrive, key: 'local' },
  { icon: EyeOff, key: 'private' },
  { icon: Sparkles, key: 'yours' },
] as const;

export function OnboardingHero() {
  const { t } = useTranslation();
  const completeOnboarding = useSessionStore((state) => state.completeOnboarding);
  const [isLeaving, setIsLeaving] = useState(false);

  const handleStart = () => {
    setIsLeaving(true);
    void completeOnboarding();
  };

  return (
    <motion.div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/25 px-8 backdrop-blur-2xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05, transition: { duration: 0.35, ease: [0.32, 0.72, 0, 1] } }}
      aria-live="polite"
    >
      <motion.div
        className="flex w-full max-w-xl flex-col items-center gap-8 text-center"
        initial="hidden"
        animate={isLeaving ? 'hidden' : 'visible'}
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.09, delayChildren: 0.1 } },
        }}
      >
        <motion.div
          variants={{
            hidden: { opacity: 0, scale: 0.8 },
            visible: { opacity: 1, scale: 1, transition: springBouncy },
          }}
          className="gpu"
        >
          <Logo size={96} animated className="drop-shadow-[0_16px_48px_rgb(124_124_240/0.45)]" />
        </motion.div>

        <motion.div
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0, transition: springGentle },
          }}
          className="flex flex-col gap-3"
        >
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t('onboarding.welcome')}
          </h1>
          <p className="text-[0.95rem] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {t('onboarding.subtitle')}
          </p>
        </motion.div>

        <motion.ul
          variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0, transition: springGentle },
          }}
          className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {PILLARS.map(({ icon: Icon, key }) => (
            <li
              key={key}
              className="glass-panel-subtle glass-hairline flex flex-col items-center gap-2 rounded-2xl px-4 py-5"
            >
              <Icon strokeWidth={1.5} className="size-5 text-zinc-500 dark:text-zinc-400" />
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {t(`onboarding.pillars.${key}`)}
              </span>
              <span className="text-xs leading-snug text-zinc-500 dark:text-zinc-500">
                {t(`onboarding.pillars.${key}Desc`)}
              </span>
            </li>
          ))}
        </motion.ul>

        <motion.div
          variants={{
            hidden: { opacity: 0, y: 16 },
            visible: { opacity: 1, y: 0, transition: springBouncy },
          }}
        >
          <Button variant="accent" size="lg" onClick={handleStart} className="px-10">
            {t('onboarding.getStarted')}
          </Button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
