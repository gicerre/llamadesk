import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  ChevronRight,
  Layers,
  Lock,
  Play,
  Search,
  ShieldAlert,
  SquareTerminal,
} from 'lucide-react';
import { NodeIcon } from '@/components/NodeIcon';
import { Kbd } from '@/components/ui/Kbd';
import { cn } from '@/lib/cn';
import { easeOut } from '@/lib/motion';

/* ============================================================================
   Le scenette del tour: piccole ricostruzioni dell'interfaccia vera, fatte con
   gli stessi elementi (tessere, righe, chip, tasti). Ogni animazione parte una
   volta sola quando lo schermo compare — nessun ciclo infinito.

   Mostrano solo cose che l'applicazione fa davvero: workspace, progetti e
   sezioni, apertura con lo strumento giusto e Avvio, palette, conferma e blocco.
   ========================================================================== */

const fade = (delay: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { delay, duration: 0.24, ease: easeOut },
});

const card = 'bg-surface shadow-1 rounded-lg';

/** Riga finta, della stessa altezza di quelle vere. */
function Row({
  icon,
  title,
  subtitle,
  trailing,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(card, 'flex h-11 items-center gap-2.5 px-2.5', className)}>
      <span className="bg-hover text-ink-2 flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-3.5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block truncate text-xs font-semibold">{title}</span>
        {subtitle && (
          <span className="text-2xs text-ink-3 block truncate font-mono">{subtitle}</span>
        )}
      </span>
      {trailing}
    </div>
  );
}

function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'accent' | 'danger';
}) {
  return (
    <span
      className={cn(
        'text-2xs flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 font-semibold [&_svg]:size-3',
        tone === 'accent' && 'bg-accent-soft text-accent',
        tone === 'danger' && 'bg-danger-soft text-danger',
        tone === 'neutral' && 'bg-hover text-ink-2',
      )}
    >
      {children}
    </span>
  );
}

/** 1. I workspace: aree separate, una alla volta. */
export function WorkspacesDemo() {
  const { t } = useTranslation();
  const names = [
    { name: t('onboarding.demo.workspaceWork'), color: '#3C62C4' },
    { name: t('onboarding.demo.workspacePersonal'), color: '#B0553A' },
    { name: t('onboarding.demo.workspaceStudy'), color: '#7A4B8C' },
  ];
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex gap-3">
        {names.map((workspace, index) => (
          <motion.div
            key={workspace.name}
            {...fade(index * 0.12)}
            className={cn(
              card,
              'flex w-[124px] flex-col gap-2 p-3',
              index === 0 && 'shadow-[0_0_0_2px_var(--ld-accent)]',
            )}
          >
            <NodeIcon
              kind="workspace"
              name={workspace.name}
              icon={null}
              color={workspace.color}
              size="md"
            />
            <span className="text-ink truncate text-xs font-semibold">{workspace.name}</span>
            <span className="bg-hover h-1.5 w-2/3 rounded-full" />
          </motion.div>
        ))}
      </div>
      <motion.div {...fade(0.5)} className="text-ink-3 flex items-center gap-2 text-xs">
        <Kbd>Ctrl+1…9</Kbd>
        {t('onboarding.demo.switch')}
      </motion.div>
    </div>
  );
}

/** 2. Progetto, sottoprogetti come schede, sezioni dentro. */
export function ProjectsDemo() {
  const { t } = useTranslation();
  const tabs = ['Overview', 'Backend', 'Frontend'];
  return (
    <div className={cn(card, 'mx-auto w-full max-w-[420px] p-3')}>
      <div className="flex items-center gap-2">
        <NodeIcon kind="project" name="SpecialHub" icon={null} color="#3C62C4" size="md" />
        <span className="text-ink text-sm font-semibold">SpecialHub</span>
      </div>
      <div className="border-line mt-3 flex gap-3 border-b">
        {tabs.map((tab, index) => (
          <motion.span
            key={tab}
            {...fade(0.1 + index * 0.08)}
            className={cn(
              'relative pb-1.5 text-xs',
              index === 1 ? 'text-ink font-semibold' : 'text-ink-3',
            )}
          >
            {tab}
            {index === 1 && (
              <motion.span
                layoutId="tour-tab"
                className="bg-accent absolute inset-x-0 -bottom-px h-0.5 rounded-full"
              />
            )}
          </motion.span>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {[
          { label: 'DEV', chip: null },
          {
            label: 'PROD',
            chip: (
              <Chip tone="danger">
                <ShieldAlert />
                {t('states.caution')}
              </Chip>
            ),
          },
        ].map((section, index) => (
          <motion.div
            key={section.label}
            {...fade(0.3 + index * 0.12)}
            className="flex flex-col gap-1.5"
          >
            <span className="text-2xs text-ink-3 flex items-center gap-2 font-semibold tracking-[0.06em] uppercase">
              {section.label}
              {section.chip}
            </span>
            <Row
              icon={<Layers />}
              title={`SpecialHub ${section.label}`}
              subtitle="github · jira · grafana"
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

/** 3. Aprire con lo strumento giusto, e l'Avvio che li mette in fila. */
export function ToolsDemo() {
  const { t } = useTranslation();
  const tools = ['IntelliJ IDEA', 'Windows Terminal', 'Chrome · Work'];
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3">
      <motion.div {...fade(0)}>
        <Row
          icon={<SquareTerminal />}
          title="specialhub-backend"
          subtitle="C:\dev\specialhub\backend"
          trailing={
            <Chip tone="accent">{t('onboarding.demo.openIn', { tool: 'IntelliJ IDEA' })}</Chip>
          }
        />
      </motion.div>
      <div className="flex flex-wrap justify-center gap-2">
        {tools.map((tool, index) => (
          <motion.span
            key={tool}
            {...fade(0.2 + index * 0.1)}
            className={cn(card, 'text-2xs text-ink-2 px-2 py-1 font-semibold')}
          >
            {tool}
          </motion.span>
        ))}
      </div>
      <motion.div {...fade(0.6)} className={cn(card, 'flex items-center gap-2 p-2.5')}>
        <Chip tone="accent">
          <Play />
          {t('launch.run')}
        </Chip>
        <span className="text-ink-3 text-xs">{t('onboarding.demo.launch')}</span>
        <span className="ml-auto flex gap-1" aria-hidden>
          {[0, 1, 2].map((dot) => (
            <motion.span
              key={dot}
              initial={{ opacity: 0.2 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 + dot * 0.18, duration: 0.2 }}
              className="bg-accent size-1.5 rounded-full"
            />
          ))}
        </span>
      </motion.div>
    </div>
  );
}

/** 4. La palette: si scrive, e la ricerca propone gia' l'azione. */
export function PaletteDemo() {
  const { t } = useTranslation();
  const query = 'camunda term';
  const [typed, setTyped] = useState('');

  useEffect(() => {
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setTyped(query.slice(0, index));
      if (index >= query.length) window.clearInterval(timer);
    }, 55);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className={cn(card, 'mx-auto w-full max-w-[420px] overflow-hidden')}>
      <div className="border-line flex h-10 items-center gap-2 border-b px-3">
        <Search className="text-ink-3 size-3.5" aria-hidden />
        <span className="text-ink text-xs">
          {typed}
          <motion.span
            aria-hidden
            animate={{ opacity: [1, 0] }}
            transition={{ repeat: 6, duration: 0.5 }}
            className="bg-ink ml-px inline-block h-3 w-px align-middle"
          />
        </span>
        <Kbd className="ml-auto">Esc</Kbd>
      </div>
      <div className="flex flex-col gap-1 p-2">
        <motion.div {...fade(0.9)}>
          <Row
            icon={<NodeIcon kind="subproject" name="Camunda" icon={null} color={null} size="sm" />}
            title="Camunda"
            subtitle="Work › SpecialHub"
            trailing={<Chip tone="accent">{t('actions.run.terminal')}</Chip>}
          />
        </motion.div>
        <motion.div {...fade(1.05)} className="text-2xs text-ink-3 px-1">
          {t('onboarding.demo.paletteHint')}
        </motion.div>
      </div>
    </div>
  );
}

/** 5. Conferma e blocco: le due difese contro il clic sbagliato. */
export function SafetyDemo() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-3">
      <motion.div {...fade(0)}>
        <Row
          icon={<Layers />}
          title="SpecialHub PROD"
          subtitle="operate · grafana · kibana"
          trailing={
            <Chip tone="danger">
              <ShieldAlert />
              {t('states.caution')}
            </Chip>
          }
        />
      </motion.div>
      <motion.div {...fade(0.35)} className={cn(card, 'flex items-center gap-3 p-3')}>
        <span className="bg-hover text-ink-2 flex size-8 items-center justify-center rounded-full">
          <Lock className="size-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="text-ink block text-xs font-semibold">
            {t('onboarding.demo.protectedTitle')}
          </span>
          <span className="text-2xs text-ink-3 block">{t('onboarding.demo.protectedText')}</span>
        </span>
        <Kbd className="ml-auto">Ctrl+L</Kbd>
      </motion.div>
      <motion.div {...fade(0.6)} className="text-ink-3 flex items-center gap-1.5 text-xs">
        <ChevronRight className="size-3.5" aria-hidden />
        {t('onboarding.demo.safetyHint')}
      </motion.div>
    </div>
  );
}
