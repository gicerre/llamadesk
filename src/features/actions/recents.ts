import { useTranslation } from 'react-i18next';
import { useTools } from '@/lib/queries';
import type { RecentAction } from '@/types/generated/RecentAction';
import type { ActionId } from './registry';
import { runAction } from './run';

/** "Aperto in IntelliJ IDEA", "Terminale": come si era aperto, per riconoscerlo. */
export function useRecentDescription() {
  const { t } = useTranslation();
  const tools = useTools(true);
  return (recent: RecentAction) => {
    const tool = (tools.data ?? []).find((candidate) => candidate.id === recent.toolId);
    const key = ['open', 'open_with', 'terminal', 'reveal', 'open_remote'].includes(recent.actionId)
      ? recent.actionId
      : 'open';
    return tool
      ? t('actions.recent.withTool', { tool: tool.name })
      : t(`actions.recent.${key}`, { kind: t(`kinds.one.${recent.node.kind}`) });
  };
}

/** Ripete l'azione come la prima volta: stesso strumento, stesso workspace. */
export function rerun(recent: RecentAction, workspaceId: string | null) {
  return runAction({
    node: recent.node,
    actionId: recent.actionId as ActionId,
    toolId: recent.toolId,
    workspaceId: recent.viaWorkspaceId ?? workspaceId,
  });
}
