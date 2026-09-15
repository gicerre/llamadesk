import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AppWindow,
  Calendar,
  Check,
  Copy,
  ExternalLink,
  FileText,
  GripVertical,
  Mail,
  MoonStar,
  Pencil,
  Plus,
  Star,
} from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import { springSnappy, staggerItem } from '@/lib/motion';
import { DangerBadge } from '@/features/danger-zone/DangerBadge';
import type { ApplicationWithLinks, DangerLevel, Link, LinkUsage } from '@/types/domain';

const LINK_ICON = {
  web: AppWindow,
  calendar: Calendar,
  mail: Mail,
  doc: FileText,
  other: ExternalLink,
} as const;

/** Livello che l'applicazione erediterebbe dal contenitore che la ospita. */
export interface InheritedDanger {
  level: DangerLevel;
  from: string | null;
}

interface ApplicationCardProps {
  application: ApplicationWithLinks;
  /** Salute dei link, indicizzata per id. */
  health: Record<string, LinkUsage>;
  onOpen: (linkId: string) => void;
  onEdit: (application: ApplicationWithLinks) => void;
  inheritedLevel: InheritedDanger;
}

export function ApplicationCard({
  application,
  health,
  onOpen,
  onEdit,
  inheritedLevel,
}: ApplicationCardProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: application.id,
  });

  const defaultLink: Link | undefined =
    application.links.find((link) => link.isDefault) ?? application.links[0];

  // Il livello proprio dell'app vince su quello ereditato dal contenitore.
  const level = application.dangerLevel ?? inheritedLevel.level;
  const inheritedFrom = application.dangerLevel ? null : inheritedLevel.from;

  // Un link dormiente non è rotto: è solo dimenticato. Segnalarlo basta.
  const dormant = application.links.filter(
    (link) => health[link.id]?.staleness === 'dormant' || health[link.id]?.staleness === 'never',
  );
  const isDormant = application.links.length > 0 && dormant.length === application.links.length;

  const copyUrl = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!defaultLink) return;
    await navigator.clipboard.writeText(defaultLink.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <motion.div
      ref={setNodeRef}
      variants={staggerItem}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      transition={springSnappy}
      onClick={() => (defaultLink ? onOpen(defaultLink.id) : onEdit(application))}
      className={cn(
        'glass-panel-subtle glass-hairline gpu group relative cursor-pointer rounded-2xl p-3.5',
        'transition-shadow duration-300 hover:shadow-[var(--shadow-glass)]',
        'hover:border-black/10 dark:hover:border-white/[0.16]',
        level === 'critical' && 'border-red-500/25 dark:border-red-500/25',
        isDragging && 'z-10 opacity-80 shadow-[var(--shadow-glass-lg)]',
      )}
    >
      <div className="flex items-start gap-3">
        {/* Maniglia di trascinamento: appare solo al passaggio del mouse. */}
        <button
          type="button"
          {...attributes}
          {...listeners}
          onClick={(event) => event.stopPropagation()}
          aria-label="drag"
          className="mt-1 cursor-grab text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing dark:text-zinc-600"
        >
          <GripVertical strokeWidth={1.75} className="size-4" />
        </button>

        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl text-lg',
            'bg-black/[0.05] dark:bg-white/[0.07]',
          )}
          style={application.color ? { backgroundColor: `${application.color}22` } : undefined}
        >
          {application.icon ?? '\u{1F517}'}
        </span>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {application.name}
            </span>
            {application.isFavorite && (
              <Star strokeWidth={2} className="size-3 shrink-0 fill-amber-400 text-amber-400" />
            )}
          </div>

          {defaultLink ? (
            <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
              {defaultLink.url}
            </span>
          ) : (
            // Senza link il click non aprirebbe nulla: invece di restare muta,
            // la card dice che cosa manca e porta dove si aggiunge.
            <span className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400">
              <Plus strokeWidth={2} className="size-3" />
              {t('applications.noLink')}
            </span>
          )}

          {/* Più link: chip separati, ognuno apribile singolarmente. */}
          {application.links.length > 1 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {application.links.map((link) => {
                const Icon = LINK_ICON[link.kind];
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(link.id);
                    }}
                    className={cn(
                      'flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6875rem] font-medium',
                      'bg-black/[0.05] text-zinc-600 hover:bg-black/[0.1]',
                      'dark:bg-white/[0.07] dark:text-zinc-300 dark:hover:bg-white/[0.14]',
                      'transition-colors duration-200',
                    )}
                  >
                    <Icon strokeWidth={1.75} className="size-2.5" />
                    {link.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <DangerBadge level={level} inheritedFrom={inheritedFrom} compact />
          {isDormant && (
            <Badge tone="neutral" className="gap-1" title={t('health.dormantHint')}>
              <MoonStar strokeWidth={1.75} className="size-3" />
              {t('health.dormant')}
            </Badge>
          )}
        </div>
      </div>

      {/* Azioni rapide: compaiono in hover, non affollano la card a riposo. */}
      <div className="absolute top-2.5 right-2.5 flex gap-0.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <button
          type="button"
          onClick={copyUrl}
          title={t('common.copyUrl')}
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-black/[0.07] dark:text-zinc-400 dark:hover:bg-white/10"
        >
          {copied ? (
            <Check strokeWidth={2} className="size-3.5 text-emerald-500" />
          ) : (
            <Copy strokeWidth={1.75} className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(application);
          }}
          title={t('common.edit')}
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-black/[0.07] dark:text-zinc-400 dark:hover:bg-white/10"
        >
          <Pencil strokeWidth={1.75} className="size-3.5" />
        </button>
      </div>
    </motion.div>
  );
}
