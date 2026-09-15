import i18n from '@/lib/i18n';
import { api } from '@/lib/ipc';
import { invalidateEverything } from '@/lib/queries';
import { toast, toastError } from '@/stores/toasts';

/** Blocca subito tutte le sessioni e rilegge cio' che si vede. */
export async function lockNow() {
  try {
    await api.lockSession();
    toast({ title: i18n.t('lock.lockedNow') });
  } catch (error) {
    toastError(i18n.t('lock.lockFailed'), error);
  } finally {
    await invalidateEverything();
  }
}
