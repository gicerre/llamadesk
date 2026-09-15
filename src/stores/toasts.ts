import { create } from 'zustand';

/* Toast: l'esito di un'azione, in basso al centro, uno alla volta. */

export interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: 'neutral' | 'error';
  action?: { label: string; run: () => void };
  /** Millisecondi; `null` = resta finche' non si chiude (errori). */
  duration: number | null;
}

interface ToastState {
  current: Toast | null;
  show: (
    toast: Omit<Toast, 'id' | 'tone' | 'duration'> & Partial<Pick<Toast, 'tone' | 'duration'>>,
  ) => void;
  dismiss: (id?: number) => void;
}

let sequence = 0;
let timer: number | undefined;

export const useToasts = create<ToastState>((set, get) => ({
  current: null,

  show: (input) => {
    window.clearTimeout(timer);
    const tone = input.tone ?? 'neutral';
    const toast: Toast = {
      ...input,
      id: ++sequence,
      tone,
      // Con un "Annulla" serve piu' tempo per leggere e decidere.
      duration:
        input.duration !== undefined
          ? input.duration
          : tone === 'error'
            ? null
            : input.action
              ? 8000
              : 4000,
    };
    set({ current: toast });
    if (toast.duration !== null) {
      timer = window.setTimeout(() => get().dismiss(toast.id), toast.duration);
    }
  },

  dismiss: (id) => {
    if (id === undefined || get().current?.id === id) set({ current: null });
  },
}));

export const toast = (input: Parameters<ToastState['show']>[0]) => useToasts.getState().show(input);

/** Un errore del backend come toast leggibile. */
export function toastError(title: string, error: unknown) {
  toast({
    title,
    description: error instanceof Error ? error.message : String(error),
    tone: 'error',
  });
}
