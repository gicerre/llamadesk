import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { backdropVariants, modalVariants } from '@/lib/motion';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Tinta rossa dell'overlay e alone luminescente: per la Danger Zone. */
  tone?: 'neutral' | 'danger';
  /** I modali "critical" non si chiudono con ESC né cliccando fuori. */
  dismissible?: boolean;
  className?: string;
  labelledBy?: string;
}

export function Modal({
  open,
  onClose,
  children,
  tone = 'neutral',
  dismissible = true,
  className,
  labelledBy,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  /* Focus trap: il focus da tastiera non deve mai uscire dal modale. */
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [dismissible, onClose],
  );

  useEffect(() => {
    if (!open) return;

    previousFocus.current = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', handleKeyDown);

    const timer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }, 60);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.clearTimeout(timer);
      previousFocus.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          <motion.div
            variants={backdropVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={dismissible ? onClose : undefined}
            className={cn(
              'absolute inset-0 backdrop-blur-xl',
              tone === 'danger' ? 'bg-red-950/40' : 'bg-black/40',
            )}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              'glass-panel-strong glass-hairline gpu relative w-full max-w-lg rounded-3xl p-6',
              tone === 'danger' &&
                'border-red-500/30 shadow-[0_0_40px_rgb(239_68_68/0.2),0_24px_64px_-16px_rgb(0_0_0/0.5)]',
              className,
            )}
          >
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
