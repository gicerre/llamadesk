import { AnimatePresence, motion } from 'framer-motion';
import { CircleAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { toastVariants } from '@/lib/motion';
import { useToasts } from '@/stores/toasts';
import { Button } from './Button';

/* Stati vuoti, caricamento, errori e toast: nessuna schermata resta muta. */

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, actions, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <span className="bg-hover text-ink-3 mb-4 flex size-11 items-center justify-center rounded-full [&_svg]:size-5">
        {icon}
      </span>
      <h3 className="font-display text-ink text-lg font-semibold text-balance">{title}</h3>
      {description && (
        <p className="text-ink-2 mt-1.5 max-w-[46ch] text-sm text-balance">{description}</p>
      )}
      {actions && <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('bg-hover animate-pulse rounded-sm', className)} aria-hidden />;
}

interface ErrorPanelProps {
  title: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorPanel({ title, message, onRetry, retryLabel }: ErrorPanelProps) {
  return (
    <div
      role="alert"
      className="bg-danger-soft text-ink flex items-start gap-3 rounded-lg px-4 py-3 text-sm"
    >
      <CircleAlert className="text-danger mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{title}</p>
        <p className="selectable text-ink-2 mt-0.5">{message}</p>
      </div>
      {onRetry && retryLabel && (
        <Button size="sm" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  );
}

export function Toaster() {
  const { t } = useTranslation();
  const current = useToasts((state) => state.current);
  const dismiss = useToasts((state) => state.dismiss);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4"
    >
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.id}
            variants={toastVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role={current.tone === 'error' ? 'alert' : 'status'}
            className="bg-ink text-canvas shadow-3 pointer-events-auto flex max-w-[min(520px,100%)] items-center gap-3 rounded-lg py-2 pr-2 pl-4 text-sm"
          >
            {current.tone === 'error' && (
              <CircleAlert className="text-danger size-4 shrink-0" aria-hidden />
            )}
            <div className="min-w-0 py-0.5">
              <p className="font-semibold">{current.title}</p>
              {current.description && (
                <p className="selectable text-canvas/70 text-xs">{current.description}</p>
              )}
            </div>
            {current.action && (
              <button
                type="button"
                onClick={() => {
                  current.action?.run();
                  dismiss(current.id);
                }}
                className="text-canvas hover:bg-canvas/15 h-7 shrink-0 rounded-sm px-2.5 text-sm font-semibold"
              >
                {current.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label={t('common.close')}
              onClick={() => dismiss(current.id)}
              className="text-canvas/70 hover:bg-canvas/15 hover:text-canvas flex size-7 shrink-0 items-center justify-center rounded-sm"
            >
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
