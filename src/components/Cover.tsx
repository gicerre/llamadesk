import { convertFileSrc } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/cn';
import { api, isTauri } from '@/lib/ipc';
import type { Node } from '@/types/generated/Node';

/**
 * Indirizzo `asset:` dell'immagine di una cover. Solo nell'app: nel browser
 * le cover non esistono (non c'e' un disco da leggere).
 */
function useAssetUrl(assetId: string | null) {
  return useQuery({
    queryKey: ['asset', assetId],
    queryFn: async () => convertFileSrc(await api.assetPath(assetId as string)),
    enabled: !!assetId && isTauri(),
    staleTime: Infinity,
  });
}

type CoverNode = Pick<Node, 'coverAssetId' | 'coverFocusX' | 'coverFocusY'>;

/**
 * Cover di workspace e progetti: l'immagine inquadrata sul punto focale,
 * con una sfumatura verso il fondo cosi' il testo sotto resta leggibile.
 */
export function Cover({
  node,
  className,
  fade = true,
}: {
  node: CoverNode;
  className?: string;
  fade?: boolean;
}) {
  const url = useAssetUrl(node.coverAssetId);
  if (!url.data) return null;
  return (
    <div className={cn('relative overflow-hidden', className)} aria-hidden>
      <img
        src={url.data}
        alt=""
        draggable={false}
        className="size-full object-cover"
        style={{ objectPosition: `${node.coverFocusX * 100}% ${node.coverFocusY * 100}%` }}
      />
      {fade && (
        <div className="to-canvas absolute inset-0 bg-gradient-to-b from-transparent from-40%" />
      )}
    </div>
  );
}

/**
 * Cover senza immagine: una fascia con la sfumatura del colore scelto (o
 * dell'accento del workspace). E' la cover predefinita di workspace e progetti.
 */
export function AccentCover({ color, className }: { color?: string | null; className?: string }) {
  const tint = color ?? 'var(--ld-accent-base)';
  return (
    <div
      aria-hidden
      className={cn('w-full', className)}
      style={{
        background: `linear-gradient(135deg, color-mix(in oklch, ${tint} 24%, var(--ld-canvas)), color-mix(in oklch, ${tint} 8%, var(--ld-canvas)) 62%, var(--ld-canvas))`,
      }}
    />
  );
}

/** Anteprima in cui un clic sceglie il punto focale. */
export function CoverFocus({
  node,
  onFocus,
}: {
  node: CoverNode;
  onFocus: (x: number, y: number) => void;
}) {
  const url = useAssetUrl(node.coverAssetId);
  if (!url.data) return null;
  return (
    <button
      type="button"
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const clamp = (value: number) => Math.min(1, Math.max(0, value));
        onFocus(
          Math.round(clamp((event.clientX - box.left) / box.width) * 100) / 100,
          Math.round(clamp((event.clientY - box.top) / box.height) * 100) / 100,
        );
      }}
      className="relative block aspect-[16/9] w-full cursor-crosshair overflow-hidden rounded-md"
    >
      <img src={url.data} alt="" draggable={false} className="size-full object-cover" />
      <span
        aria-hidden
        className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.4)]"
        style={{ left: `${node.coverFocusX * 100}%`, top: `${node.coverFocusY * 100}%` }}
      />
    </button>
  );
}
