import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

/**
 * Si puo' tornare indietro o andare avanti? React Router tiene l'indice della
 * voce corrente in `history.state.idx`; il massimo raggiunto si azzera a ogni
 * nuova navigazione, come in un browser.
 */
export function useHistoryAvailability() {
  const location = useLocation();
  const type = useNavigationType();
  const furthest = useRef(0);
  const [state, setState] = useState({ back: false, forward: false });

  useEffect(() => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    furthest.current = type === 'POP' ? Math.max(furthest.current, index) : index;
    setState({ back: index > 0, forward: index < furthest.current });
  }, [location.key, type]);

  return state;
}
