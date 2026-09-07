import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { DangerModal } from './DangerModal';
import { BulkDangerModal } from './BulkDangerModal';
import { useOpenStore } from './openStore';
import { springBouncy } from '@/lib/motion';

/**
 * Vive una volta sola nella shell: i modali di conferma e gli errori di
 * apertura non appartengono a nessuna pagina in particolare.
 */
export function DangerZoneHost() {
  const intent = useOpenStore((state) => state.intent);
  const plan = useOpenStore((state) => state.plan);
  const error = useOpenStore((state) => state.error);
  const confirmSingle = useOpenStore((state) => state.confirmSingle);
  const confirmMany = useOpenStore((state) => state.confirmMany);
  const cancel = useOpenStore((state) => state.cancel);
  const clearError = useOpenStore((state) => state.clearError);

  return (
    <>
      <DangerModal intent={intent} onConfirm={() => void confirmSingle()} onCancel={cancel} />
      <BulkDangerModal
        plan={plan}
        onConfirm={(linkIds) => void confirmMany(linkIds)}
        onCancel={cancel}
      />

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: springBouncy }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="glass-panel-strong fixed bottom-6 left-1/2 z-50 flex max-w-lg -translate-x-1/2 items-center gap-3 rounded-2xl border-red-500/30 px-4 py-3"
          >
            <span className="text-sm text-red-500 dark:text-red-400">{error}</span>
            <button
              type="button"
              onClick={clearError}
              className="rounded-full p-1 text-zinc-500 hover:bg-black/10 dark:hover:bg-white/10"
              aria-label="close"
            >
              <X strokeWidth={2} className="size-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
