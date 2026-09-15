import { cn } from '@/lib/cn';

/* ============================================================================
   Simbolo LlamaDesk — concept C "Collo a L" (decisione D10), versione
   provvisoria: la rifinitura e il set di icone arrivano con la fase 7.

   Una L maiuscola: l'asta e' il collo della llama, in cima testa e orecchie,
   il piede e' la scrivania in blu Titicaca. Sotto i 32px si usa la versione
   semplificata, con le orecchie unite da una tacca.
   ========================================================================== */

interface BrandMarkProps {
  size?: number;
  className?: string;
  /** Tessera grafite, come l'icona dell'app. */
  tile?: boolean;
  title?: string;
}

function Mark({ small }: { small: boolean }) {
  if (small) {
    return (
      <g transform="translate(-2 2)">
        <rect x="140" y="170" width="100" height="262" rx="30" fill="currentColor" />
        <rect x="140" y="344" width="236" height="88" rx="30" className="fill-brand" />
        <rect x="140" y="150" width="196" height="96" rx="44" fill="currentColor" />
        <path d="M140 190V100q0-24 24-24h12l14 36 14-36h12q24 0 24 24v90z" fill="currentColor" />
      </g>
    );
  }
  return (
    <g transform="translate(-7 4)">
      <rect x="148" y="176" width="80" height="250" rx="28" fill="currentColor" />
      <rect x="148" y="356" width="230" height="70" rx="28" className="fill-brand" />
      <rect x="148" y="146" width="176" height="76" rx="38" fill="currentColor" />
      <rect x="154" y="78" width="32" height="96" rx="16" fill="currentColor" />
      <rect x="198" y="92" width="32" height="82" rx="16" fill="currentColor" />
    </g>
  );
}

export function BrandMark({
  size = 24,
  className,
  tile = false,
  title = 'LlamaDesk',
}: BrandMarkProps) {
  const small = size < 32;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      role="img"
      aria-label={title}
      className={cn('shrink-0', tile ? 'text-[#eef2f1]' : 'text-ink', className)}
    >
      {tile ? (
        <>
          <rect width="512" height="512" rx="116" fill="#1e2427" />
          <g transform="translate(72 72) scale(0.72)">
            <Mark small={small} />
          </g>
        </>
      ) : (
        <Mark small={small} />
      )}
    </svg>
  );
}
