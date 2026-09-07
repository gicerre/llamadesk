import { useTranslation } from 'react-i18next';
import { AlertTriangle, ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { DangerLevel } from '@/types/domain';

const TONE: Record<Exclude<DangerLevel, 'normal'>, 'prod' | 'test' | 'neutral'> = {
  warning: 'test',
  danger: 'prod',
  critical: 'prod',
};

const ICON = {
  warning: AlertTriangle,
  danger: TriangleAlert,
  critical: ShieldAlert,
  normal: ShieldCheck,
} as const;

interface DangerBadgeProps {
  level: DangerLevel;
  /** Nome dell'entità da cui il livello è ereditato, se non è il proprio. */
  inheritedFrom?: string | null;
  className?: string;
  compact?: boolean;
}

/** Indicatore inequivocabile: colore, icona e, per il critical, un dot pulsante. */
export function DangerBadge({ level, inheritedFrom, className, compact }: DangerBadgeProps) {
  const { t } = useTranslation();
  if (level === 'normal') return null;

  const Icon = ICON[level];

  return (
    <Badge
      tone={TONE[level]}
      pulse={level === 'critical'}
      className={cn('gap-1', className)}
      title={inheritedFrom ? t('danger.inheritedFrom', { name: inheritedFrom }) : undefined}
    >
      <Icon strokeWidth={2} className="size-3" />
      {!compact && t(`danger.levels.${level}`).toUpperCase()}
    </Badge>
  );
}
