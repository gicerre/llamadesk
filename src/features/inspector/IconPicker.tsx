import { createElement, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover } from 'radix-ui';
import { Search } from 'lucide-react';
import { NodeIcon } from '@/components/NodeIcon';
import { Button } from '@/components/ui/Button';
import { inputClass } from '@/components/ui/fields';
import { menuSurface } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import { fold } from '@/lib/fuzzy';
import { ICONS } from '@/lib/icons';
import type { Node } from '@/types/generated/Node';

/**
 * Icona di un contenitore: le iniziali (predefinite) o una delle icone del set,
 * cercabili per parola ("banca", "viaggi", "code").
 */
export function IconPicker({
  node,
  onChange,
}: {
  node: Pick<Node, 'kind' | 'name' | 'icon' | 'colorMain'>;
  onChange: (icon: string | null) => void;
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
      <span className="text-ink-2 text-xs font-semibold">{t('inspector.icon')}</span>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger asChild>
          <Button className="self-start">
            <NodeIcon
              kind={node.kind}
              name={node.name}
              icon={node.icon}
              color={node.colorMain}
              size="xs"
            />
            {node.icon ? t('icons.change') : t('icons.choose')}
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
              aria-label={t('inspector.icon')}
              className="grid max-h-64 grid-cols-7 gap-1 overflow-y-auto"
            >
              {words.length === 0 && (
                <button
                  type="button"
                  role="option"
                  aria-selected={!node.icon}
                  title={t('inspector.iconDefault')}
                  aria-label={t('inspector.iconDefault')}
                  className={cell(!node.icon)}
                  onClick={() => choose(null)}
                >
                  <NodeIcon
                    kind={node.kind}
                    name={node.name}
                    icon={null}
                    color={node.colorMain}
                    size="xs"
                  />
                </button>
              )}
              {matches.map((entry) => {
                const value = `lucide:${entry.name}`;
                return (
                  <button
                    key={entry.name}
                    type="button"
                    role="option"
                    aria-selected={node.icon === value}
                    title={entry.name}
                    aria-label={entry.name}
                    className={cell(node.icon === value)}
                    onClick={() => choose(value)}
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
