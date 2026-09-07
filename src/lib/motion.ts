import type { Transition, Variants } from 'framer-motion';

/* ============================================================================
   MOTION SYSTEM — LlamaDesk
   Regola: le interazioni fisiche usano SOLO molle (spring). I `tween` sono
   ammessi esclusivamente per opacità e colore, dove non esiste "massa".
   Animiamo solo `transform` e `opacity` (hardware accelerated).
   ========================================================================== */

/** Veloce e preciso, rimbalzo impercettibile. Hover, toggle, micro-feedback. */
export const springSnappy: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
  mass: 0.8,
};

/** Rimbalzo naturale in chiusura d'animazione. Ingresso di modali e popover. */
export const springBouncy: Transition = {
  type: 'spring',
  stiffness: 300,
  damping: 20,
  mass: 0.9,
};

/** Morbido e ampio. Transizioni di pagina e spostamenti lunghi. */
export const springGentle: Transition = {
  type: 'spring',
  stiffness: 120,
  damping: 14,
  mass: 1,
};

/** Riservata a opacità/blur del backdrop: qui una molla non ha senso fisico. */
export const fadeFast: Transition = { duration: 0.18, ease: [0.32, 0.72, 0, 1] };

/* --------------------------------------------------------------------------
   Micro-interazioni riutilizzabili
   -------------------------------------------------------------------------- */

/** Card di vetro: fluttua in hover, si schiaccia al click. */
export const interactiveCard = {
  whileHover: { y: -2, transition: springSnappy },
  whileTap: { scale: 0.97, transition: springSnappy },
} as const;

/** Bottoni e pillole: pressione fisica più marcata. */
export const interactiveButton = {
  whileHover: { scale: 1.02, transition: springSnappy },
  whileTap: { scale: 0.95, transition: springSnappy },
} as const;

/** Tag/badge cliccabili: solo il click, nessun hover invadente. */
export const interactiveTag = {
  whileTap: { scale: 0.95, transition: springSnappy },
} as const;

/* --------------------------------------------------------------------------
   Orchestrazione: la "cascata" di card in ingresso
   -------------------------------------------------------------------------- */

/** Da applicare al contenitore di una lista/griglia. */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
  exit: { opacity: 0, transition: fadeFast },
};

/** Da applicare a ogni figlio del contenitore sopra. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: springBouncy },
  exit: { opacity: 0, y: -8, transition: fadeFast },
};

/* --------------------------------------------------------------------------
   Overlay: backdrop, modali, Command Palette
   -------------------------------------------------------------------------- */

export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: fadeFast },
  exit: { opacity: 0, transition: fadeFast },
};

/** Il pannello viene "lanciato" morbidamente verso l'utente. */
export const modalVariants: Variants = {
  hidden: { opacity: 0, scale: 0.9, y: 8 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springBouncy },
  exit: { opacity: 0, scale: 0.95, y: 4, transition: fadeFast },
};

/** Spotlight: entra dall'alto, quasi senza spostamento verticale. */
export const paletteVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -12 },
  visible: { opacity: 1, scale: 1, y: 0, transition: springBouncy },
  exit: { opacity: 0, scale: 0.98, y: -8, transition: fadeFast },
};

/* --------------------------------------------------------------------------
   Transizioni di pagina (route)
   -------------------------------------------------------------------------- */

export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: springGentle },
  exit: { opacity: 0, y: -6, transition: fadeFast },
};

/** layoutId condivisi: un solo posto per evitare collisioni fra componenti. */
export const LAYOUT_IDS = {
  sidebarPill: 'activeSidebarPill',
  paletteHighlight: 'paletteHighlight',
  tabIndicator: 'activeTabIndicator',
  themePill: 'activeThemePill',
} as const;
