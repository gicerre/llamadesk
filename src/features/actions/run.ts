import { create } from 'zustand';
import i18n from '@/lib/i18n';
import { api, CONFIRMATION_REQUIRED, type ActionArgs } from '@/lib/ipc';
import { queryClient } from '@/lib/queries';
import { useSession } from '@/stores/session';
import { toast, toastError } from '@/stores/toasts';
import type { ActionOutcome } from '@/types/generated/ActionOutcome';
import type { ActionPlan } from '@/types/generated/ActionPlan';
import type { Node } from '@/types/generated/Node';
import { copyText, type ActionId } from './registry';

/* ============================================================================
   Esecuzione delle azioni, da qualunque punto: righe, menu, Continua,
   recenti e (fase 5) palette.

   Il primo tentativo parte senza conferma. Se l'elemento la chiede, Rust
   rifiuta con `confirmation_required`: allora si legge il piano (quante cose,
   con quale strumento) e si mostra il dialogo. La regola resta in Rust; qui
   c'e' solo la conversazione con l'utente.
   ========================================================================== */

export interface RunRequest {
  node: Pick<Node, 'id' | 'name' | 'url' | 'path'>;
  actionId: ActionId;
  toolId?: string | null;
  /** Workspace da cui si arriva: percorso, preferenze e recenti lo seguono. */
  workspaceId?: string | null;
}

interface PendingConfirmation {
  args: ActionArgs;
  plan: ActionPlan;
}

interface ConfirmState {
  pending: PendingConfirmation | null;
  ask: (pending: PendingConfirmation) => void;
  close: () => void;
}

export const useActionConfirm = create<ConfirmState>((set) => ({
  pending: null,
  ask: (pending) => set({ pending }),
  close: () => set({ pending: null }),
}));

export async function runAction(request: RunRequest): Promise<void> {
  const { t } = i18n;

  if (request.actionId === 'copy') {
    try {
      await navigator.clipboard.writeText(copyText(request.node));
      toast({ title: t(request.node.path ? 'actions.done.copiedPath' : 'actions.done.copiedUrl') });
    } catch (error) {
      toastError(t('actions.failed', { name: request.node.name }), error);
    }
    return;
  }

  const profileId = useSession.getState().activeProfileId ?? '';
  const args: ActionArgs = {
    profileId,
    nodeId: request.node.id,
    actionId: request.actionId,
    toolId: request.toolId ?? null,
    viaWorkspaceId: request.workspaceId ?? null,
  };

  try {
    const outcome = await api.executeAction(args);
    announce(request.actionId, request.node.name, outcome);
  } catch (error) {
    if (!isConfirmationRequired(error)) {
      toastError(t('actions.failed', { name: request.node.name }), error);
      return;
    }
    try {
      const plan = await api.prepareAction(args);
      useActionConfirm.getState().ask({ args, plan });
    } catch (failure) {
      toastError(t('actions.failed', { name: request.node.name }), failure);
    }
  }
}

/** Seconda meta' del giro: l'utente ha confermato nel dialogo. */
export async function confirmAction(pending: PendingConfirmation, confirmation: string) {
  const outcome = await api.executeAction(pending.args, confirmation);
  announce(pending.args.actionId as ActionId, pending.plan.nodeName, outcome);
}

function isConfirmationRequired(error: unknown) {
  return error instanceof Error && error.message.includes(CONFIRMATION_REQUIRED);
}

/** Toast breve: che cosa si e' aperto e dove. I recenti si aggiornano subito. */
function announce(actionId: ActionId, name: string, outcome: ActionOutcome) {
  const { t } = i18n;
  void queryClient.invalidateQueries({ queryKey: ['recents'] });

  const where = outcome.toolName
    ? outcome.browserProfile
      ? t('actions.done.inProfile', { tool: outcome.toolName, profile: outcome.browserProfile })
      : t('actions.done.in', { tool: outcome.toolName })
    : '';

  const title =
    actionId === 'reveal'
      ? t('actions.done.revealed', { name })
      : actionId === 'terminal'
        ? t('actions.done.terminal', { name })
        : outcome.opened > 1
          ? t('actions.done.openedMany', { count: outcome.opened, name })
          : t('actions.done.opened', { name });

  toast({
    title,
    description: actionId === 'terminal' ? (outcome.toolName ?? undefined) : where || undefined,
  });
}
