import { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover } from 'radix-ui';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/fields';
import { menuSurface } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import { fold } from '@/lib/fuzzy';
import { ICONS } from '@/lib/icons';

/**
 * Sceglie un'icona del set ("lucide:<nome>") o nessuna, cercandola per parola
 * ("banca", "viaggi", "code"). Chi la usa disegna l'anteprima: la stessa icona
 * vive su tessere diverse (workspace, progetto, profilo).
 */
export function IconPicker({
  value,
  onChange,
  preview,
  label,
  defaultLabel,
}: {
  value: string | null;
  onChange: (icon: string | null) => void;
  /** Anteprima di un'icona (o delle iniziali, con `null`). */
  preview: (icon: string | null) => React.ReactNode;
  label?: string;
  /** Nome della scelta senza icona ("Iniziali"). */
  defaultLabel: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const words = fold(query).split(/\s+/).filter(Boolean);
  const matches = ICONS.filter((entry) => {
    const haystack = fold(`${entry.name} ${entry.keywords}`);
    return words.every((word) => haystack.includes(word));
  });

  const choose = (icon: string | null) => {
    onChange(icon);
    setOpen(false);
    setQuery('');
  };

  const cell = (selected: boolean) =>
    cn(
      'flex size-9 items-center justify-center rounded-md transition-colors duration-120 hover:bg-hover',
      selected && 'bg-accent-soft shadow-[inset_0_0_0_2px_var(--ld-accent)]',
    );

  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-ink-2 text-xs font-semibold">{label}</span>}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button className="self-start">
            {preview(value)}
            {value ? t('icons.change') : t('icons.choose')}
          </Button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            collisionPadding={12}
            className={cn(menuSurface, 'w-[312px] p-2')}
          >
            <label className="relative mb-2 block">
              <span className="sr-only">{t('icons.search')}</span>
              <Search className="text-ink-3 absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('icons.search')}
                className={cn(inputClass, 'pl-8')}
              />
            </label>
            <div
              role="listbox"
              aria-label={label ?? t('inspector.icon')}
              className="grid max-h-64 grid-cols-7 gap-1 overflow-y-auto"
            >
              {words.length === 0 && (
                <button
                  type="button"
                  role="option"
                  aria-selected={!value}
                  title={defaultLabel}
                  aria-label={defaultLabel}
                  className={cell(!value)}
                  onClick={() => choose(null)}
                >
                  {preview(null)}
                </button>
              )}
              {matches.map((entry) => {
                const icon = `lucide:${entry.name}`;
                return (
                  <button
                    key={entry.name}
                    type="button"
                    role="option"
                    aria-selected={value === icon}
                    title={entry.name}
                    aria-label={entry.name}
                    className={cell(value === icon)}
                    onClick={() => choose(icon)}
                  >
                    {createElement(entry.icon, {
                      className: 'text-ink-2 size-[18px]',
                      'aria-hidden': true,
                    })}
                  </button>
                );
              })}
            </div>
            {matches.length === 0 && (
              <p className="text-ink-3 px-1 py-3 text-center text-xs">{t('icons.none')}</p>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
