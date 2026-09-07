import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { Hash, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { springSnappy } from '@/lib/motion';
import { ipc, isTauri } from '@/lib/ipc';
import { useSessionStore } from '@/stores/sessionStore';
import type { TaggableType } from '@/types/domain';

interface TagInputProps {
  entityType: TaggableType;
  entityId: string;
  className?: string;
}

/**
 * Tag come testo libero: si scrive un nome e Invio.
 *
 * Non esiste un'anagrafica da gestire — il backend crea il tag se serve e lo
 * elimina quando resta senza elementi. Un tag è un'etichetta, non un'entità
 * che l'utente deve amministrare.
 */
export function TagInput({ entityType, entityId, className }: TagInputProps) {
  const { t } = useTranslation();
  const profileId = useSessionStore((state) => state.activeProfileId);

  const [names, setNames] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;

    void ipc
      .tagsForEntity(entityType, entityId)
      .then((tags) => {
        if (!cancelled) setNames(tags.map((tag) => tag.name));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  const persist = (next: string[]) => {
    setNames(next);
    if (profileId && isTauri()) {
      void ipc.setEntityTags(profileId, entityType, entityId, next).catch(() => undefined);
    }
  };

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    // Confronto senza distinzione di maiuscole: "Urgente" e "urgente" sono lo
    // stesso tag, ed è il backend a garantirlo. Qui evitiamo solo il doppione
    // visivo prima ancora di scrivere.
    if (names.some((name) => name.toLowerCase() === value.toLowerCase())) {
      setDraft('');
      return;
    }
    persist([...names, value]);
    setDraft('');
  };

  const remove = (name: string) => persist(names.filter((entry) => entry !== name));

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <AnimatePresence initial={false}>
        {names.map((name) => (
          <motion.span
            key={name}
            layout
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={springSnappy}
            className={cn(
              'flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2 text-[0.6875rem] font-medium',
              'bg-black/[0.06] text-zinc-600 dark:bg-white/10 dark:text-zinc-300',
            )}
          >
            {name}
            <button
              type="button"
              onClick={() => remove(name)}
              aria-label={`${t('common.delete')} ${name}`}
              className="rounded-full p-0.5 text-zinc-400 hover:bg-black/10 hover:text-zinc-700 dark:hover:bg-white/15 dark:hover:text-zinc-100"
            >
              <X strokeWidth={2.5} className="size-2.5" />
            </button>
          </motion.span>
        ))}
      </AnimatePresence>

      <div className="flex items-center gap-1 rounded-full bg-black/[0.03] px-2 py-0.5 dark:bg-white/[0.05]">
        <Hash strokeWidth={2} className="size-2.5 text-zinc-400" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={add}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
            if (event.key === 'Backspace' && draft.length === 0 && names.length > 0) {
              remove(names[names.length - 1] as string);
            }
          }}
          placeholder={t('tags.add')}
          className="w-24 bg-transparent py-0.5 text-[0.6875rem] placeholder:text-zinc-400 focus:w-32"
        />
      </div>
    </div>
  );
}
