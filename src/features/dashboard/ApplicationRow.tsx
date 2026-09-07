import { motion } from 'framer-motion';
import { cn } from '@/lib/cn';
import { springSnappy } from '@/lib/motion';
import { DangerBadge } from '@/features/danger-zone/DangerBadge';
import type { ApplicationWithLinks } from '@/types/domain';

interface ApplicationRowProps {
  application: ApplicationWithLinks;
  onOpen: (linkId: string) => void;
}

/** Riga compatta usata dai widget della dashboard: icona, nome, URL. */
export function ApplicationRow({ application, onOpen }: ApplicationRowProps) {
  const defaultLink = application.links.find((link) => link.isDefault) ?? application.links[0];

  return (
    <motion.button
      type="button"
      whileHover={{ x: 2 }}
      whileTap={{ scale: 0.98 }}
      transition={springSnappy}
      onClick={() => defaultLink && onOpen(defaultLink.id)}
      className={cn(
        'flex items-center gap-3 rounded-xl px-2.5 py-2 text-left',
        'transition-colors duration-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.07]',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-black/[0.05] text-sm dark:bg-white/[0.07]">
        {application.icon ?? '\u{1F517}'}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {application.name}
        </span>
        {defaultLink && (
          <span className="truncate text-[0.6875rem] text-zinc-500">{defaultLink.url}</span>
        )}
      </span>
      <DangerBadge level={application.dangerLevel ?? 'normal'} compact />
    </motion.button>
  );
}
