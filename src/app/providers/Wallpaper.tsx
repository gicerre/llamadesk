import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSessionStore } from '@/stores/sessionStore';
import {
  backgroundStyle,
  resolveActiveBackground,
  useBackgroundStore,
} from '@/features/backgrounds/backgroundStore';

/**
 * Lo strato che i `backdrop-blur` campionano.
 *
 * NOTA TECNICA (Windows/WebView2): `backdrop-filter` NON sfoca il desktop dietro
 * la finestra, sfoca solo ciò che sta dentro la webview. Questo wallpaper interno
 * è quindi il vero motore del glassmorphism, non una decorazione.
 *
 * Senza uno sfondo scelto dall'utente si ricade su un mesh gradient in puro
 * CSS: nessun asset, nessun peso sul bundle.
 */
export function Wallpaper() {
  const overlayOpacity = useSessionStore((state) => state.settings?.overlayOpacity ?? 30);
  const backgroundId = useSessionStore((state) => state.settings?.backgroundId ?? null);
  const activeProfileId = useSessionStore((state) => state.activeProfileId);

  const backgrounds = useBackgroundStore((state) => state.backgrounds);
  const load = useBackgroundStore((state) => state.load);

  useEffect(() => {
    void load();
  }, [load, backgroundId, activeProfileId]);

  const active = resolveActiveBackground(backgrounds);

  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {/* Base */}
      <div className="absolute inset-0 bg-[#f4f4f6] dark:bg-[#09090b]" />

      {active ? (
        <div className="absolute inset-0" style={backgroundStyle(active)} />
      ) : (
        <>
          {/* Mesh gradient di default: tre sorgenti luminose che respirano. */}
          <motion.div
            className="absolute -top-1/4 -left-1/4 size-[70vw] rounded-full blur-[120px]"
            style={{
              background: 'radial-gradient(circle, rgb(124 124 240 / 0.45), transparent 65%)',
            }}
            animate={{ x: [0, 40, 0], y: [0, 24, 0] }}
            transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute top-1/4 -right-1/5 size-[60vw] rounded-full blur-[120px]"
            style={{
              background: 'radial-gradient(circle, rgb(139 92 246 / 0.35), transparent 65%)',
            }}
            animate={{ x: [0, -32, 0], y: [0, 40, 0] }}
            transition={{ duration: 34, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute -bottom-1/4 left-1/3 size-[55vw] rounded-full blur-[120px]"
            style={{
              background: 'radial-gradient(circle, rgb(34 211 238 / 0.28), transparent 65%)',
            }}
            animate={{ x: [0, 28, 0], y: [0, -30, 0] }}
            transition={{ duration: 31, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      )}

      {/* Overlay di leggibilità: garantisce sempre contrasto sotto le card. */}
      <div
        className="absolute inset-0 bg-white dark:bg-black"
        style={{ opacity: overlayOpacity / 100 }}
      />
    </div>
  );
}
