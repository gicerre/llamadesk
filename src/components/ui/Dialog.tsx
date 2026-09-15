import { Dialog as Primitive } from 'radix-ui';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from './Button';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Etichetta del pulsante di chiusura (tradotta dal chiamante). */
  closeLabel: string;
}

/**
 * Dialogo breve: conferme e moduli di pochi campi. I moduli lunghi vivono nel
 * pannello di dettaglio, non qui. Focus, Esc e ritorno del focus li gestisce Radix.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  closeLabel,
}: DialogProps) {
  return (
    <Primitive.Root open={open} onOpenChange={onOpenChange}>
      <Primitive.Portal>
        <Primitive.Overlay className="fixed inset-0 z-40 bg-black/30 data-[state=open]:animate-[fade-in_180ms_var(--ease-out)] dark:bg-black/50" />
        <Primitive.Content
          className={cn(
            'fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(440px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col',
            'bg-raised shadow-3 rounded-xl data-[state=open]:animate-[dialog-in_180ms_var(--ease-out)]',
            className,
          )}
        >
          <header className="flex items-start gap-3 px-5 pt-5">
            <div className="min-w-0 flex-1">
              <Primitive.Title className="font-display text-ink text-lg font-semibold">
                {title}
              </Primitive.Title>
              {description ? (
                <Primitive.Description className="text-ink-2 mt-1 text-sm">
                  {description}
                </Primitive.Description>
              ) : (
                <Primitive.Description className="sr-only">{title}</Primitive.Description>
              )}
            </div>
            <Primitive.Close asChild>
              <Button
                variant="ghost"
                size="sm"
                iconOnly
                aria-label={closeLabel}
                className="-mt-1 -mr-2"
              >
                <X />
              </Button>
            </Primitive.Close>
          </header>
          {children && <div className="min-h-0 overflow-y-auto px-5 pt-4">{children}</div>}
          {footer && <footer className="flex justify-end gap-2 px-5 pt-5 pb-5">{footer}</footer>}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
