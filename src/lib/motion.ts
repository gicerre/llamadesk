import type { Transition, Variants } from 'framer-motion';

/* ============================================================================
   Motion (docs/REDESIGN.md § 10) — veloce prima che bello.

   Un'animazione esiste solo se dice da dove viene una cosa o che cosa e'
   successo. Niente rimbalzi: curve decelerate brevi, e molle smorzate solo per
   il trascinamento. Si animano solo transform e opacity.
   ========================================================================== */

export const easeOut = [0.2, 0, 0, 1] as const;
export const easeIn = [0.3, 0, 1, 1] as const;

/** Secondi, per framer-motion. */
export const duration = {
  hover: 0.12,
  menu: 0.14,
  tab: 0.16,
  page: 0.18,
  dialog: 0.18,
  sidebar: 0.2,
  accent: 0.24,
  launch: 0.3,
} as const;

export const tabTransition: Transition = { duration: duration.tab, ease: easeOut };

/** Molla senza rimbalzo, per indicatori che scorrono e trascinamenti. */
export const settle: Transition = { type: 'spring', stiffness: 520, damping: 44, mass: 0.9 };

/** Ingresso di pagina: nessuna attesa dell'uscita della pagina precedente. */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.page, ease: easeOut } },
};

export const dialogVariants: Variants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: { opacity: 1, scale: 1, transition: { duration: duration.dialog, ease: easeOut } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.12, ease: easeIn } },
};

export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: duration.dialog, ease: easeOut } },
  exit: { opacity: 0, transition: { duration: 0.12, ease: easeIn } },
};

export const toastVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: duration.dialog, ease: easeOut } },
  exit: { opacity: 0, y: 8, transition: { duration: 0.12, ease: easeIn } },
};

/** layoutId condivisi: un solo posto per evitare collisioni. */
export const LAYOUT_IDS = {
  scopeTab: 'scope-tab-indicator',
  settingsTab: 'settings-tab-indicator',
} as const;
