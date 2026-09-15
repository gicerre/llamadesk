import { useCallback, useEffect, useState } from 'react';
import { ipc, isTauri } from '@/lib/ipc';
import type { DashboardWidget, WidgetConfig } from '@/types/domain';

/**
 * I widget del profilo e le operazioni per sistemarli.
 *
 * Ogni modifica si vede subito e poi viene confermata dal database con una
 * ricarica: la dashboard non deve "aspettare" il disco, ma nemmeno divergere
 * da lui (Rust ripulisce la configurazione e può ribilanciare l'ordine).
 */
export function useDashboardWidgets(profileId: string | null) {
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);

  const reload = useCallback(async () => {
    if (!profileId || !isTauri()) return;
    try {
      setWidgets(await ipc.listWidgets(profileId));
    } catch {
      // Senza widget la dashboard mostra comunque l'invito a personalizzarla.
    }
  }, [profileId]);

  useEffect(() => {
    if (!profileId || !isTauri()) return;

    let cancelled = false;
    void ipc
      .listWidgets(profileId)
      .then((list) => {
        if (!cancelled) setWidgets(list);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [profileId]);

  const persist = useCallback(
    async (write: () => Promise<unknown>) => {
      try {
        await write();
      } catch {
        // Nessun errore da mostrare: la ricarica qui sotto rimette a schermo
        // lo stato vero, e il cambiamento rifiutato sparisce da solo.
      }
      await reload();
    },
    [reload],
  );

  const patch = (id: string, change: Partial<DashboardWidget>) =>
    setWidgets((current) =>
      current.map((widget) => (widget.id === id ? { ...widget, ...change } : widget)),
    );

  /**
   * Sposta `movedId` fra due vicini. `null` = estremo della lista. I vicini
   * sono presi fra i widget visibili: dove stanno quelli nascosti non conta.
   */
  const move = (movedId: string, previousId: string | null, nextId: string | null) => {
    setWidgets((current) => {
      const moved = current.find((widget) => widget.id === movedId);
      if (!moved) return current;
      const rest = current.filter((widget) => widget.id !== movedId);
      const at = previousId
        ? rest.findIndex((widget) => widget.id === previousId) + 1
        : nextId
          ? rest.findIndex((widget) => widget.id === nextId)
          : rest.length;
      return [...rest.slice(0, at), moved, ...rest.slice(at)];
    });
    void persist(() => ipc.moveWidget(movedId, previousId, nextId));
  };

  const hide = (id: string) => {
    patch(id, { isVisible: false });
    void persist(() => ipc.updateWidget(id, { isVisible: false }));
  };

  /** Un widget rimesso sulla dashboard compare in fondo, dove lo si cerca. */
  const show = (id: string) => {
    const last = widgets.filter((widget) => widget.id !== id).at(-1)?.id ?? null;
    patch(id, { isVisible: true });
    setWidgets((current) => {
      const shown = current.find((widget) => widget.id === id);
      return shown ? [...current.filter((widget) => widget.id !== id), shown] : current;
    });
    void persist(async () => {
      await ipc.updateWidget(id, { isVisible: true });
      await ipc.moveWidget(id, last, null);
    });
  };

  const configure = (id: string, config: WidgetConfig) => {
    patch(id, { config });
    void persist(() => ipc.updateWidget(id, { config }));
  };

  return { widgets, move, hide, show, configure };
}
