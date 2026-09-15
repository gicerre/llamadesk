import type { TFunction } from 'i18next';
import type { LaunchStep } from '@/types/generated/LaunchStep';

/** "Apri in IntelliJ IDEA", "Terminale": che cosa fa un passo. */
export function stepLabel(t: TFunction, step: LaunchStep): string {
  const tool = step.toolName;
  switch (step.actionId) {
    case 'open_with':
      if (step.target.kind === 'path') {
        return tool ? t('actions.run.openInIdeTool', { tool }) : t('actions.run.openInIde');
      }
      return tool ? t('actions.run.openInIdeTool', { tool }) : t('actions.run.openInBrowser');
    case 'terminal':
      return tool ? t('actions.run.terminalTool', { tool }) : t('actions.run.terminal');
    case 'reveal':
      return t('actions.run.reveal');
    case 'open_remote':
      return t('actions.run.openRemote');
    default:
      return step.target.kind === 'link_group' ? t('actions.run.openAll') : t('actions.run.open');
  }
}
