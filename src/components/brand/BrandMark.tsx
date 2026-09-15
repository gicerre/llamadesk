import { useId } from 'react';
import { cn } from '@/lib/cn';
import { BRAND, REGULAR, SMALL, SMALL_BELOW, shapePath } from './shapes';

/* ============================================================================
   Simbolo LlamaDesk — concept C "Collo a L" (D10).

   Una L maiuscola: l'asta e' il collo della llama, in cima testa e orecchie,
   il piede e' la scrivania in blu Titicaca. Fino a 32px le orecchie si
   uniscono con una tacca, perche' due aste sottili a 16px diventano rumore.
   La geometria vive in `geometry.json`, condivisa con le icone dell'app.
   ========================================================================== */

export type BrandTone =
  /** Inchiostro e Titicaca del tema corrente. */
  | 'theme'
  /** Un solo colore, quello del testo (stampa, sovrapposizioni, tray). */
  | 'mono';

interface BrandMarkProps {
  size?: number;
  className?: string;
  /** Tessera grafite, come l'icona dell'app. */
  tile?: boolean;
  tone?: BrandTone;
  title?: string;
  /** Il simbolo decora qualcosa che ha gia' un nome: niente etichetta. */
  decorative?: boolean;
}

export function BrandMark({
  size = 24,
  className,
  tile = false,
  tone = 'theme',
  title = 'LlamaDesk',
  decorative = false,
}: BrandMarkProps) {
  const gradient = useId();
  const small = size <= SMALL_BELOW;
  const shapes = small ? SMALL : REGULAR;
  // Nella tessera piccola il simbolo cresce: a 16-32 px ogni pixel conta.
  const scale = small ? BRAND.tile.smallSymbolScale : BRAND.tile.symbolScale;
  const radius = BRAND.viewBox * BRAND.tile.radiusRatio;
  const offset = (BRAND.viewBox * (1 - scale)) / 2;

  const fillFor = (shapeTone: 'ink' | 'brand') => {
    if (tone === 'mono') return 'currentColor';
    if (tile) return shapeTone === 'brand' ? BRAND.brand.onTile : BRAND.ink.onTile;
    return shapeTone === 'brand' ? 'var(--ld-brand)' : 'currentColor';
  };

  const symbol = shapes.map((shape, index) => (
    <path key={index} d={shapePath(shape)} fill={fillFor(shape.tone)} />
  ));

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${BRAND.viewBox} ${BRAND.viewBox}`}
      role={decorative ? undefined : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
      className={cn('shrink-0', !tile && tone === 'theme' && 'text-ink', className)}
    >
      {tile ? (
        <>
          <defs>
            <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={BRAND.tile.top} />
              <stop offset="1" stopColor={BRAND.tile.bottom} />
            </linearGradient>
          </defs>
          <rect
            width={BRAND.viewBox}
            height={BRAND.viewBox}
            rx={radius}
            fill={tone === 'mono' ? 'currentColor' : `url(#${gradient})`}
          />
          <g
            transform={`translate(${offset} ${offset}) scale(${scale})`}
            className={tone === 'mono' ? 'text-canvas' : undefined}
          >
            {symbol}
          </g>
        </>
      ) : (
        symbol
      )}
    </svg>
  );
}

/** "LlamaDesk" nel carattere di sistema, con la spaziatura del titolo. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'font-display text-ink leading-none font-semibold tracking-[-0.02em] select-none',
        className,
      )}
    >
      LlamaDesk
    </span>
  );
}

/** Logo completo: simbolo e nome, allineati sull'altezza delle maiuscole. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center', className)} style={{ gap: size * 0.3 }}>
      <BrandMark size={size} decorative />
      <Wordmark className="text-[1em]" />
    </span>
  );
}
