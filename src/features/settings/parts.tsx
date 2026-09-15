import { useId } from 'react';
import { cn } from '@/lib/cn';

export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-2xs text-ink-3 mb-2 font-semibold tracking-[0.08em] uppercase">
        {title}
      </h2>
      <div className="divide-line bg-surface shadow-1 divide-y rounded-lg">{children}</div>
    </section>
  );
}

interface RowProps {
  label: string;
  hint?: string;
  note?: string;
  control: (id: string) => React.ReactNode;
}

export function Row({ label, hint, note, control }: RowProps) {
  const id = useId();
  return (
    <div className={cn('flex min-h-14 items-center gap-4 px-4 py-2.5')}>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-ink block text-sm font-medium">
          {label}
        </label>
        {hint && <p className="text-ink-3 text-xs">{hint}</p>}
        {note && <p className="text-accent text-xs">{note}</p>}
      </div>
      {control(id)}
    </div>
  );
}
