import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeft, Folder, Link2 } from 'lucide-react';
import { SearchInput } from '@/components/ui';
import { cn } from '@/lib/cn';
import { backdropVariants, LAYOUT_IDS, paletteVariants, springSnappy } from '@/lib/motion';
import { ipc, isTauri } from '@/lib/ipc';
import { useUiStore } from '@/stores/uiStore';
import { useSessionStore } from '@/stores/sessionStore';
import { useOpenStore } from '@/features/danger-zone/openStore';
import { DangerBadge } from '@/features/danger-zone/DangerBadge';
import type { SearchHit } from '@/types/domain';

/** Riferimento stabile: evita di ricreare un array vuoto a ogni render. */
const EMPTY_HITS: SearchHit[] = [];

/** Il contenuto monta solo a palette aperta: query e selezione nascono pulite. */
function PaletteContent({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profileId = useSessionStore((state) => state.activeProfileId);
  const requestOpen = useOpenStore((state) => state.requestOpen);

  const [query, setQuery] = useState(() => useUiStore.getState().paletteQuery);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // A query vuota non mostriamo nulla: è una proprietà derivata, non uno stato
  // da azzerare in un effetto.
  const hits = query.trim().length === 0 ? EMPTY_HITS : results;

  // Debounce corto: il database è locale, ma non serve interrogarlo a ogni tasto.
  useEffect(() => {
    if (!profileId || !isTauri() || query.trim().length === 0) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void ipc
        .search(profileId, query)
        .then((found) => {
          if (!cancelled) {
            setResults(found);
            setSelected(0);
          }
        })
        .catch(() => setResults([]));
    }, 90);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, profileId]);

  const activate = useMemo(
    () => (hit: SearchHit | undefined) => {
      if (!hit) return;
      onClose();
      if (hit.entityType === 'link') void requestOpen(hit.id);
      else navigate(`/c/${hit.id}`);
    },
    [navigate, onClose, requestOpen],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelected((current) => (hits.length === 0 ? 0 : (current + 1) % hits.length));
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelected((current) =>
          hits.length === 0 ? 0 : (current - 1 + hits.length) % hits.length,
        );
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        activate(hits[selected]);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [hits, selected, activate, onClose]);

  // Mantiene visibile la riga selezionata quando ci si muove da tastiera.
  useEffect(() => {
    listRef.current?.children[selected]?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <motion.div
      variants={paletteVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      role="dialog"
      aria-modal="true"
      className="glass-panel-strong glass-hairline gpu relative w-full max-w-2xl overflow-hidden rounded-3xl shadow-[var(--shadow-spotlight)]"
    >
      <SearchInput
        scale="lg"
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder={t('palette.placeholder')}
      />
      <div className="h-px bg-black/[0.06] dark:bg-white/[0.08]" />

      {hits.length === 0 ? (
        <div className="px-3 py-8">
          <p className="text-center text-sm text-zinc-500 dark:text-zinc-500">
            {query.trim().length === 0 ? t('palette.hint') : t('palette.empty')}
          </p>
        </div>
      ) : (
        <ul ref={listRef} className="flex max-h-80 flex-col gap-0.5 overflow-y-auto p-2">
          {hits.map((hit, index) => {
            const isSelected = index === selected;
            const Icon = hit.entityType === 'link' ? Link2 : Folder;

            return (
              <li key={`${hit.entityType}-${hit.id}`}>
                <button
                  type="button"
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => activate(hit)}
                  className="relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left"
                >
                  {isSelected && (
                    <motion.span
                      layoutId={LAYOUT_IDS.paletteHighlight}
                      transition={springSnappy}
                      className="absolute inset-0 -z-10 rounded-xl bg-black/[0.06] dark:bg-white/10"
                    />
                  )}
                  <Icon strokeWidth={1.75} className="size-4 shrink-0 text-zinc-400" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                      {hit.name}
                    </span>
                    <span className="truncate text-[0.6875rem] text-zinc-500">
                      {hit.path}
                      {hit.subtitle && hit.entityType === 'link' ? ` · ${hit.subtitle}` : ''}
                    </span>
                  </span>
                  {/* Un elemento protetto si riconosce prima di premere Invio. */}
                  <DangerBadge level={hit.dangerLevel} compact />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="flex items-center gap-4 border-t border-black/[0.06] px-4 py-2.5 text-[0.6875rem] text-zinc-500 dark:border-white/[0.08] dark:text-zinc-500">
        <span className="flex items-center gap-1.5">
          <CornerDownLeft strokeWidth={1.75} className="size-3" />
          {t('palette.hintOpen')}
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="font-mono">↑↓</kbd>
          {t('palette.hintNavigate')}
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="font-mono">esc</kbd>
          {t('palette.hintClose')}
        </span>
      </footer>
    </motion.div>
  );
}

/**
 * Command Palette (CTRL+SPACE) — stile Spotlight/Raycast: barra al 20%
 * dall'alto, input gigante, ombra estesa.
 */
export function CommandPalette() {
  const isOpen = useUiStore((state) => state.isPaletteOpen);
  const close = useUiStore((state) => state.closePalette);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className={cn('fixed inset-0 z-50 flex items-start justify-center pt-[20vh]')}>
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={close}
            className="absolute inset-0 bg-black/40 backdrop-blur-xl"
          />
          <PaletteContent onClose={close} />
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
