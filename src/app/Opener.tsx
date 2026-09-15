import { useEffect, useState } from 'react';
import { motion, type Transition } from 'framer-motion';
import { BRAND, REGULAR, shapePath, type Part } from '@/components/brand/shapes';
import { useOpener } from '@/stores/opener';

/* ============================================================================
   Apertura (docs/REDESIGN.md § 11, D10): la scrivania si stende, il collo si
   alza, arrivano testa e orecchie, poi il nome; il simbolo rimpicciolisce
   verso la barra del titolo mentre la shell, gia' pronta sotto, compare.

   Nessun allungamento artificiale: la shell si carica in parallelo e
   l'animazione dura meno di un secondo. Solo transform e opacity.
   ========================================================================== */

const MARK = 120;
const BUILD_MS = 650;
const FLY_MS = 300;
const ease = [0.2, 0, 0, 1] as const;

/** Da dove cresce ogni parte e quando (secondi). */
const GROW: Record<Part, { from: 'x' | 'y'; delay: number; duration: number }> = {
  desk: { from: 'x', delay: 0, duration: 0.22 },
  neck: { from: 'y', delay: 0.12, duration: 0.26 },
  head: { from: 'x', delay: 0.3, duration: 0.18 },
  ear: { from: 'y', delay: 0.38, duration: 0.14 },
  ears: { from: 'y', delay: 0.38, duration: 0.14 },
};

interface Target {
  x: number;
  y: number;
  scale: number;
}

export function Opener() {
  const phase = useOpener((state) => state.phase);
  const run = useOpener((state) => state.run);
  if (phase !== 'build' && phase !== 'fly') return null;
  return <OpenerScene key={run} />;
}

function OpenerScene() {
  const phase = useOpener((state) => state.phase);
  const setPhase = useOpener((state) => state.setPhase);
  const [target, setTarget] = useState<Target | null>(null);

  useEffect(() => {
    const toFly = window.setTimeout(() => {
      // Il simbolo nella barra del titolo, se c'e' (sidebar aperta): li' atterra.
      const anchor = document.querySelector('[data-brand-anchor]')?.getBoundingClientRect();
      if (anchor && anchor.width > 0) {
        setTarget({
          x: anchor.left + anchor.width / 2 - window.innerWidth / 2,
          y: anchor.top + anchor.height / 2 - window.innerHeight / 2,
          scale: anchor.width / MARK,
        });
      }
      setPhase('fly');
    }, BUILD_MS);
    const toDone = window.setTimeout(() => setPhase('done'), BUILD_MS + FLY_MS);
    return () => {
      window.clearTimeout(toFly);
      window.clearTimeout(toDone);
    };
  }, [setPhase]);

  const flying = phase === 'fly';
  const fly: Transition = { duration: FLY_MS / 1000, ease: [0.3, 0, 0, 1] };

  return (
    <motion.div
      aria-hidden
      className="bg-canvas pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
      initial={{ opacity: 1 }}
      animate={{ opacity: flying ? 0 : 1 }}
      transition={{ duration: 0.25, delay: flying ? 0.05 : 0, ease }}
    >
      <div className="relative flex flex-col items-center">
        <motion.svg
          width={MARK}
          height={MARK}
          viewBox={`0 0 ${BRAND.viewBox} ${BRAND.viewBox}`}
          className="text-ink"
          initial={false}
          animate={
            flying && target
              ? { x: target.x, y: target.y, scale: target.scale }
              : flying
                ? { opacity: 0, scale: 0.8 }
                : { x: 0, y: 0, scale: 1 }
          }
          transition={fly}
        >
          {REGULAR.map((shape, index) => {
            const grow = GROW[shape.part];
            const earsBefore = REGULAR.slice(0, index).filter(
              (other) => other.part === 'ear',
            ).length;
            const delay = grow.delay + (shape.part === 'ear' ? 0.06 * earsBefore : 0);
            const axis = grow.from === 'x' ? 'scaleX' : 'scaleY';
            return (
              <motion.path
                key={index}
                d={shapePath(shape)}
                fill={shape.tone === 'brand' ? 'var(--ld-brand)' : 'currentColor'}
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: grow.from === 'x' ? '0% 50%' : '50% 100%',
                }}
                initial={{ [axis]: 0 }}
                animate={{ [axis]: 1 }}
                transition={{ delay, duration: grow.duration, ease }}
              />
            );
          })}
        </motion.svg>
        <motion.span
          className="font-display text-ink absolute top-full mt-3 text-2xl font-semibold tracking-[-0.02em] whitespace-nowrap"
          initial={{ opacity: 0, y: 4 }}
          animate={flying ? { opacity: 0, y: 0 } : { opacity: 1, y: 0 }}
          transition={flying ? { duration: 0.1 } : { delay: 0.42, duration: 0.22, ease }}
        >
          LlamaDesk
        </motion.span>
      </div>
    </motion.div>
  );
}
