import { createContext, useContext } from 'react';
import type { Node } from '@/types/generated/Node';

/** Il contenitore di cui la pagina mostra il contenuto: dove finisce "Aggiungi all'Avvio". */
export const LaunchOwnerContext = createContext<Pick<Node, 'id' | 'name'> | null>(null);

export const useLaunchOwner = () => useContext(LaunchOwnerContext);

export const LAUNCH_OWNER_KINDS = new Set(['project', 'subproject', 'section']);
