import { useId, useState } from 'react';
import { cn } from '@/lib/cn';
import { inputClass } from '@/components/ui/fields';

/* Campi del pannello di dettaglio: si modificano sul posto e si salvano quando
   si esce dal campo (o con Invio). Nessun pulsante "Salva" da ricordare. */

interface InlineFieldProps {
  label: string;
  value: string | null;
  onCommit: (value: string) => Promise<unknown>;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  mono?: boolean;
  /** Il campo non puo' restare vuoto. */
  required?: boolean;
}

export function InlineField({
  label,
  value,
  onCommit,
  placeholder,
  hint,
  multiline,
  mono,
  required,
}: InlineFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = draft ?? value ?? '';

  const commit = async () => {
    if (draft === null || draft === (value ?? '')) {
      setDraft(null);
      return;
    }
    if (required && !draft.trim()) {
      setDraft(null);
      return;
    }
    try {
      await onCommit(draft);
      setDraft(null);
      setError(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const shared = {
    id,
    value: shown,
    placeholder,
    'aria-invalid': error ? true : undefined,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(event.target.value);
      setError(null);
    },
    onBlur: () => void commit(),
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink-2 text-xs font-semibold">
        {label}
      </label>
      {multiline ? (
        <textarea
          {...shared}
          rows={3}
          className={cn(inputClass, 'h-auto resize-none py-1.5 leading-5')}
        />
      ) : (
        <input
          {...shared}
          className={cn(inputClass, mono && 'font-mono text-xs')}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setDraft(null);
              setError(null);
            }
          }}
        />
      )}
      {(error || hint) && (
        <p className={cn('text-xs', error ? 'text-danger' : 'text-ink-3')}>{error ?? hint}</p>
      )}
    </div>
  );
}

export function PanelSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('border-line flex flex-col gap-3 border-t px-4 py-4', className)}>
      <h3 className="text-2xs text-ink-3 font-semibold tracking-[0.08em] uppercase">{title}</h3>
      {children}
    </section>
  );
}
