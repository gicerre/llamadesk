import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/fields';
import { api, isBackendCode, NO_LOCK } from '@/lib/ipc';
import { invalidateEverything, useLockStatus } from '@/lib/queries';
import { useLockDialogs } from '@/stores/lock';
import { toastError } from '@/stores/toasts';
import type { NodeView } from '@/types/generated/NodeView';
import { PanelSection } from './fields';

/**
 * "Proteggi": nasconde il contenuto quando LlamaDesk e' bloccato. La prima
 * volta chiede di scegliere la password del profilo.
 */
export function ProtectionSection({ view }: { view: NodeView }) {
  const { t } = useTranslation();
  const id = useId();
  const status = useLockStatus();
  const openPassword = useLockDialogs((state) => state.openPassword);
  const { node, protection } = view;

  const change = async (protect: boolean) => {
    if (protect && status.data && !status.data.hasLock) {
      openPassword({ protectNodeId: node.id });
      return;
    }
    try {
      await api.updateNode(node.id, { isProtected: protect });
      await invalidateEverything();
    } catch (error) {
      if (isBackendCode(error, NO_LOCK)) openPassword({ protectNodeId: node.id });
      else toastError(t('settings.saveFailed'), error);
    }
  };

  return (
    <PanelSection title={t('lock.section')}>
      <div className="flex items-center gap-3">
        <label htmlFor={id} className="text-ink min-w-0 flex-1 text-sm">
          {t('lock.protect')}
        </label>
        <Switch id={id} checked={node.isProtected} onCheckedChange={(on) => void change(on)} />
      </div>
      <p className="text-ink-3 text-xs">
        {!node.isProtected && protection.inheritedFrom
          ? t('lock.inherited', { name: protection.inheritedFrom.name })
          : t('lock.protectHint')}
      </p>
    </PanelSection>
  );
}
