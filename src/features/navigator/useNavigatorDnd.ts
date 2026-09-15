import { createContext, useContext, type MouseEvent } from 'react';
import type { DropTarget } from './treeDrop';

export interface NavigatorDndValue {
  expanded: Set<string>;
  toggle: (id: string) => void;
  /** Il nodo trascinato, se un trascinamento è in corso. */
  draggingId: string | null;
  /** Il punto di rilascio corrente, solo se valido. */
  target: DropTarget | null;
  /** Da mettere in `onClickCapture` sulle righe: assorbe il click che segue un rilascio. */
  guardClick: (event: MouseEvent) => void;
}

/** Fornito da `<NavigatorDnd>`; separato dal componente per il fast refresh. */
export const NavigatorDndContext = createContext<NavigatorDndValue | null>(null);

export function useNavigatorDnd(): NavigatorDndValue {
  const value = useContext(NavigatorDndContext);
  if (!value) throw new Error('useNavigatorDnd va usato dentro <NavigatorDnd>');
  return value;
}
