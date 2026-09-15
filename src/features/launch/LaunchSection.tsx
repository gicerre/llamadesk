import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tip } from '@/components/ui/Tooltip';
import { api } from '@/lib/ipc';
import { invalidateLaunch, useLaunchSteps } from '@/lib/queries';
import { toastError } from '@/stores/toasts';
import type { LaunchStep } from '@/types/generated/LaunchStep';
import type { NodeView } from '@/types/generated/NodeView';
import { PanelSection } from '../inspector/fields';
import { stepLabel } from './labels';

/** I passi dell'Avvio di un contenitore: ordine e rimozione. Si aggiungono dal menu delle risorse. */
export function LaunchSection({ view }: { view: NodeView }) {
  const { t } = useTranslation();
  const steps = useLaunchSteps(view.node.id);
  const list = steps.data ?? [];

  const change = async (run: () => Promise<unknown>) => {
    try {
      await run();
      await invalidateLaunch();
    } catch (error) {
      toastError(t('launch.changeFailed'), error);
    }
  };

  const move = (step: LaunchStep, index: number, direction: -1 | 1) => {
    const ids = list.map((entry) => entry.id).filter((id) => id !== step.id);
    const target = index + direction;
    void change(() => api.moveLaunchStep(step.id, ids[target - 1] ?? null, ids[target] ?? null));
  };

  return (
    <PanelSection title={t('launch.section')}>
      <p className="text-ink-3 text-xs">
        {list.length === 0 ? t('launch.empty') : t('launch.hint')}
      </p>
      {list.length > 0 && (
        <ol className="flex flex-col gap-1">
          {list.map((step, index) => (
            <li
              key={step.id}
              className="bg-hover flex items-center gap-2 rounded-sm py-1 pr-1 pl-2"
            >
              <span className="text-2xs text-ink-3 w-4 shrink-0 tabular-nums">{index + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="text-ink block truncate text-sm">{step.target.name}</span>
                <span className="text-2xs text-ink-3 block truncate">{stepLabel(t, step)}</span>
              </span>
              <Tip label={t('inspector.moveUp')}>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={t('inspector.moveUp')}
                  disabled={index === 0}
                  onClick={() => move(step, index, -1)}
                >
                  <ArrowUp />
                </Button>
              </Tip>
              <Tip label={t('inspector.moveDown')}>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={t('inspector.moveDown')}
                  disabled={index === list.length - 1}
                  onClick={() => move(step, index, 1)}
                >
                  <ArrowDown />
                </Button>
              </Tip>
              <Tip label={t('launch.remove', { name: step.target.name })}>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={t('launch.remove', { name: step.target.name })}
                  onClick={() => void change(() => api.removeLaunchStep(step.id))}
                >
                  <X />
                </Button>
              </Tip>
            </li>
          ))}
        </ol>
      )}
    </PanelSection>
  );
}
