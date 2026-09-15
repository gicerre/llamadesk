import { useSyncExternalStore } from 'react';

/* Dimensioni della finestra che cambiano la disposizione (docs/REDESIGN.md § 10):
   sotto i 900 px la sidebar si riduce da sola, sotto i 1200 px il pannello di
   dettaglio si appoggia sopra la pagina invece di stringerla. */

function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', notify);
      return () => media.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useNarrowWindow = () => useMediaQuery('(max-width: 899px)');
export const useCompactWindow = () => useMediaQuery('(max-width: 1199px)');
