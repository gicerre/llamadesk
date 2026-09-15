import { forwardRef, useId } from 'react';
import { Switch as SwitchPrimitive, ToggleGroup } from 'radix-ui';
import { Check } from 'lucide-react';
import { cn } from '@/lib/cn';
import { COLOR_PRESETS, normalizeHex } from '@/lib/identity';

/* Campi dei moduli. Ogni campo ha un'etichetta vera e l'errore in una frase
   intera sotto il campo. */

export const inputClass =
  'h-[32px] w-full rounded-sm bg-surface px-2.5 text-sm text-ink shadow-1 outline-none ' +
  'placeholder:text-ink-3 focus-visible:shadow-[0_0_0_2px_var(--ld-accent)] ' +
  'aria-[invalid=true]:shadow-[0_0_0_1px_var(--ld-danger)]';

interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, hint, error, className, id, ...props }, ref) => {
    const generated = useId();
    const inputId = id ?? generated;
    const noteId = `${inputId}-note`;
    return (
      <div className={cn('flex flex-col gap-1.5', className)}>
        <label htmlFor={inputId} className="text-ink-2 text-xs font-semibold">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          className={inputClass}
          {...props}
        />
        {(error || hint) && (
          <p id={noteId} className={cn('text-xs', error ? 'text-danger' : 'text-ink-3')}>
            {error ?? hint}
          </p>
        )}
      </div>
    );
  },
);
TextField.displayName = 'TextField';

interface ColorFieldProps {
  label: string;
  value: string | null;
  onChange: (hex: string) => void;
  /** Nome leggibile di ogni preset, per i lettori di schermo. */
  presetLabel: (key: string) => string;
}

/** I 12 colori proposti come gruppo di scelta singola. */
export function ColorField({ label, value, onChange, presetLabel }: ColorFieldProps) {
  const current = normalizeHex(value);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-ink-2 mb-1.5 text-xs font-semibold">{label}</legend>
      <ToggleGroup.Root
        type="single"
        value={current ?? ''}
        onValueChange={(next) => next && onChange(next)}
        className="flex flex-wrap gap-1.5"
      >
        {COLOR_PRESETS.map((preset) => {
          const hex = normalizeHex(preset.hex) as string;
          return (
            <ToggleGroup.Item
              key={preset.key}
              value={hex}
              aria-label={presetLabel(preset.key)}
              title={presetLabel(preset.key)}
              className="flex size-7 items-center justify-center rounded-md text-white shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] transition-transform duration-120 hover:scale-105 data-[state=on]:shadow-[0_0_0_2px_var(--ld-canvas),0_0_0_4px_var(--ld-ink-2)]"
              style={{ backgroundColor: preset.hex }}
            >
              {current === hex && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
            </ToggleGroup.Item>
          );
        })}
      </ToggleGroup.Root>
    </fieldset>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: SegmentedProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      aria-label={label}
      onValueChange={(next) => next && onChange(next as T)}
      className="bg-hover inline-flex rounded-sm p-0.5"
    >
      {options.map((option) => (
        <ToggleGroup.Item
          key={option.value}
          value={option.value}
          className="text-ink-2 hover:text-ink data-[state=on]:bg-surface data-[state=on]:text-ink data-[state=on]:shadow-1 flex h-[26px] items-center gap-1.5 rounded-xs px-2.5 text-xs font-medium transition-colors duration-120 [&_svg]:size-3.5"
        >
          {option.icon}
          {option.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, id, disabled }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      className="bg-line-strong data-[state=checked]:bg-accent relative h-5 w-9 shrink-0 rounded-full transition-colors duration-120 disabled:opacity-40"
    >
      <SwitchPrimitive.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25)] transition-transform duration-120 ease-out data-[state=checked]:translate-x-[18px]" />
    </SwitchPrimitive.Root>
  );
}

interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: readonly { value: string; label: string }[];
  onValueChange: (value: string) => void;
}

/** Elenco a scelta singola: il `select` di sistema, con l'aspetto dei campi. */
export function Select({ options, onValueChange, className, ...props }: SelectProps) {
  return (
    <select
      {...props}
      onChange={(event) => onValueChange(event.target.value)}
      className={cn(inputClass, 'appearance-auto pr-1.5', className)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
