import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, NotebookPen } from 'lucide-react';
import { GlassPanel } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fadeFast, springSnappy } from '@/lib/motion';
import { ipc, isTauri } from '@/lib/ipc';
import type { NotableType } from '@/types/domain';

interface NotePanelProps {
  entityType: NotableType;
  entityId: string;
  className?: string;
}

/**
 * Nota locale agganciata a un elemento qualsiasi.
 *
 * Salvataggio automatico dopo una pausa di scrittura: nessun pulsante "Salva"
 * da ricordarsi, e nessuna nota persa cambiando pagina. Svuotarla la elimina.
 */
export function NotePanel({ entityType, entityId, className }: NotePanelProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState('');
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;

    void ipc
      .getNote(entityType, entityId)
      .then((note) => {
        if (cancelled) return;
        setContent(note?.content ?? '');
        setExpanded(!!note?.content);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [entityType, entityId]);

  const scheduleSave = (value: string) => {
    setContent(value);
    setSaved(false);
    window.clearTimeout(timer.current);

    timer.current = window.setTimeout(() => {
      if (!isTauri()) return;
      void ipc
        .setNote(entityType, entityId, value)
        .then(() => {
          setSaved(true);
          window.setTimeout(() => setSaved(false), 1600);
        })
        .catch(() => undefined);
    }, 600);
  };

  return (
    <GlassPanel radius="2xl" material="subtle" className={cn('overflow-hidden', className)}>
      <button
        type="button"
        onClick={() => setExpanded((open) => !open)}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <NotebookPen strokeWidth={1.75} className="size-4 text-zinc-400" />
        <span className="flex-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
          {t('notes.title')}
        </span>

        <AnimatePresence>
          {saved && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1, transition: springSnappy }}
              exit={{ opacity: 0, transition: fadeFast }}
              className="flex items-center gap-1 text-[0.6875rem] text-emerald-500"
            >
              <Check strokeWidth={2.5} className="size-3" />
              {t('notes.saved')}
            </motion.span>
          )}
        </AnimatePresence>

        {!expanded && content.length > 0 && (
          <span className="max-w-40 truncate text-[0.6875rem] text-zinc-400">{content}</span>
        )}
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <textarea
              value={content}
              onChange={(event) => scheduleSave(event.target.value)}
              placeholder={t('notes.placeholder')}
              rows={4}
              className={cn(
                'w-full resize-none bg-transparent px-4 pb-3 text-sm leading-relaxed',
                'text-zinc-700 placeholder:text-zinc-400 dark:text-zinc-200',
              )}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </GlassPanel>
  );
}
