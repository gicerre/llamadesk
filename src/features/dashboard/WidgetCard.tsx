import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useSortable } from '@dnd-kit/sortable';
import { EyeOff, GripVertical, Maximize2, Minimize2 } from 'lucide-react';
import { GlassPanel } from '@/components/ui';
import { cn } from '@/lib/cn';
import { staggerItem } from '@/lib/motion';
import { LIMIT_CHOICES, WIDGET_KINDS, widgetLimit } from './widgetKinds';
import type { DashboardWidget, WidgetConfig } from '@/types/domain';

interface WidgetCardProps {
  widget: DashboardWidget;
  editing: boolean;
  onHide: () => void;
  onConfigure: (config: WidgetConfig) => void;
  children: ReactNode;
}

const iconButton =
  'rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-black/[0.06] hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200';

/**
 * Cornice in vetro di un widget.
 *
 * In modalità "Personalizza" compaiono la maniglia per trascinarlo, le righe
 * da mostrare, la larghezza e il pulsante per nasconderlo; il contenuto resta
 * visibile ma non cliccabile, così sistemare la dashboard non apre link per
 * sbaglio.
 */
export function WidgetCard({ widget, editing, onHide, onConfigure, children }: WidgetCardProps) {
  const { t } = useTranslation();
  const info = WIDGET_KINDS[widget.kind];
  const Icon = info.icon;
  const wide = widget.config.wide ?? false;
  const limit = widgetLimit(widget);

  const { attributes, listeners, setNodeRef, isDragging, isOver } = useSortable({
    id: widget.id,
    disabled: !editing,
  });

  return (
    <motion.section
      ref={setNodeRef}
      variants={staggerItem}
      className={cn(wide && 'xl:col-span-2', isDragging && 'opacity-40')}
    >
      <GlassPanel
        radius="3xl"
        className={cn(
          'flex h-full flex-col gap-3 p-5 transition-shadow duration-200',
          editing && isOver && !isDragging && 'ring-2 ring-indigo-400/50',
        )}
      >
        <header className="flex min-h-7 items-center gap-2 text-zinc-500 dark:text-zinc-400">
          {editing && (
            <button
              type="button"
              {...attributes}
              {...listeners}
              title={t('dashboard.drag')}
              className={cn(iconButton, '-ml-1.5 cursor-grab active:cursor-grabbing')}
            >
              <GripVertical strokeWidth={1.75} className="size-4" />
            </button>
          )}
          <Icon strokeWidth={1.75} className="size-4 shrink-0" />
          <h2 className="truncate text-xs font-semibold tracking-wide uppercase">
            {t(info.titleKey)}
          </h2>

          {editing && (
            <div className="ml-auto flex items-center gap-1">
              {info.defaultLimit !== undefined && (
                <div
                  role="group"
                  aria-label={t('dashboard.rows')}
                  title={t('dashboard.rows')}
                  className="flex items-center rounded-lg bg-black/[0.04] p-0.5 dark:bg-white/[0.06]"
                >
                  {LIMIT_CHOICES.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      aria-pressed={choice === limit}
                      onClick={() => onConfigure({ ...widget.config, limit: choice })}
                      className={cn(
                        'min-w-6 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-medium tabular-nums transition-colors',
                        choice === limit
                          ? 'bg-white text-zinc-900 shadow-sm dark:bg-white/20 dark:text-zinc-50'
                          : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200',
                      )}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={() => onConfigure({ ...widget.config, wide: !wide })}
                title={wide ? t('dashboard.narrow') : t('dashboard.wide')}
                className={cn(iconButton, 'hidden xl:block')}
              >
                {wide ? (
                  <Minimize2 strokeWidth={1.75} className="size-3.5" />
                ) : (
                  <Maximize2 strokeWidth={1.75} className="size-3.5" />
                )}
              </button>

              <button
                type="button"
                onClick={onHide}
                title={t('dashboard.hide')}
                className={iconButton}
              >
                <EyeOff strokeWidth={1.75} className="size-3.5" />
              </button>
            </div>
          )}
        </header>

        <div className={cn(editing && 'pointer-events-none select-none')} inert={editing}>
          {children}
        </div>
      </GlassPanel>
    </motion.section>
  );
}
