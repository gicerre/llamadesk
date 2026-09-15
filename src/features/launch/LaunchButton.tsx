import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tip } from '@/components/ui/Tooltip';
import { useLaunchSteps } from '@/lib/queries';
import type { Node } from '@/types/generated/Node';
import { runLaunch } from '../actions/run';

/** "Avvia": compare solo se il contenitore ha passi. */
export function LaunchButton({
  owner,
  workspaceId,
}: {
  owner: Pick<Node, 'id' | 'name'>;
  workspaceId: string;
}) {
  const { t } = useTranslation();
  const steps = useLaunchSteps(owner.id);
  const count = steps.data?.length ?? 0;
  if (count === 0) return null;
  return (
    <Tip label={t('launch.tip', { count })}>
      <Button onClick={() => void runLaunch({ owner, workspaceId })}>
        <Play />
        {t('launch.run')}
      </Button>
    </Tip>
  );
}
