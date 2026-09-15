/* ============================================================================
   Risorse: riconoscere cio' che l'utente incolla, e presentarlo.

   Un solo ingresso per aggiungere (docs/REDESIGN.md § 7-8): si incolla un
   indirizzo, piu' indirizzi o un percorso, e il tipo si riconosce da solo.
   Nessuna rete: niente favicon, un monogramma con un colore derivato dal dominio.
   ========================================================================== */

export type AddIntent =
  | { kind: 'empty' }
  | { kind: 'link'; url: string; name: string }
  | { kind: 'link_group'; links: { url: string; name: string }[]; name: string }
  | { kind: 'path'; paths: { path: string; name: string }[] }
  | { kind: 'name'; name: string };

const URL_PATTERN = /^(https?:\/\/|mailto:)\S+$/i;
/** Un dominio senza schema, come "jira.example.com/board": si accetta aggiungendo https. */
const BARE_DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?(\/\S*)?$/i;
const WINDOWS_PATH = /^([a-z]:[\\/]|\\\\[^\\]+\\|%[a-z_]+%)/i;
const UNIX_PATH = /^(\/|~\/)/;

/** Domini di primo livello comuni: "example.com" si', "report.pdf" no. */
const COMMON_TLDS = new Set(
  'com it org net io dev app eu co uk de fr es ch at nl be pt us ca au info biz cloud ai me tech'.split(
    ' ',
  ),
);

export function normalizeUrl(value: string): string | null {
  const text = value.trim();
  if (URL_PATTERN.test(text)) return text;
  if (!BARE_DOMAIN.test(text) || text.includes('\\')) return null;

  // Senza schema serve un indizio che sia un indirizzo e non un nome di file:
  // un percorso o una porta, un sottodominio, oppure un dominio conosciuto.
  const host = text.split(/[/:]/)[0] ?? '';
  const labels = host.split('.');
  const hint =
    /[/:]/.test(text) || labels.length >= 3 || COMMON_TLDS.has(labels.at(-1)?.toLowerCase() ?? '');
  return hint ? `https://${text}` : null;
}

export function looksLikePath(value: string): boolean {
  const text = stripQuotes(value.trim());
  return WINDOWS_PATH.test(text) || UNIX_PATH.test(text);
}

function stripQuotes(value: string) {
  return value.replace(/^"(.*)"$/, '$1');
}

/** Nome proposto per un indirizzo: il dominio senza "www." e il primo segmento. */
export function nameForUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'mailto:') return parsed.pathname;
    const host = parsed.hostname.replace(/^www\./, '');
    const label = host.split('.')[0] ?? host;
    const segment = parsed.pathname.split('/').find(Boolean);
    const base = label.charAt(0).toUpperCase() + label.slice(1);
    return segment ? `${base} · ${decodeURIComponent(segment)}` : base;
  } catch {
    return url;
  }
}

/** Nome proposto per un percorso: l'ultimo segmento. */
export function nameForPath(path: string): string {
  const trimmed = stripQuotes(path.trim()).replace(/[\\/]+$/, '');
  return trimmed.split(/[\\/]/).filter(Boolean).at(-1) ?? trimmed;
}

/**
 * Che cosa vuole aggiungere l'utente? Righe tutte indirizzi: un link o un
 * gruppo. Righe tutte percorsi: uno o piu' percorsi locali. Altrimenti e' un
 * nome (per una sezione o un sottoprogetto).
 */
export function parseAddInput(text: string): AddIntent {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { kind: 'empty' };

  const urls = lines.map(normalizeUrl);
  if (urls.every((url): url is string => url !== null)) {
    const links = urls.map((url) => ({ url, name: nameForUrl(url) }));
    if (links.length === 1) return { kind: 'link', ...(links[0] as { url: string; name: string }) };
    return { kind: 'link_group', links, name: '' };
  }

  if (lines.every(looksLikePath)) {
    return {
      kind: 'path',
      paths: lines.map((line) => ({ path: stripQuotes(line), name: nameForPath(line) })),
    };
  }

  return { kind: 'name', name: lines.join(' ') };
}

/** Il dominio da mostrare sotto il nome di un link. */
export function displayUrl(url: string | null): string {
  if (!url) return '';
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

/** Tinta stabile per un dominio: stesso dominio, stesso colore, sempre. */
export function hueForUrl(url: string | null): number {
  let host = url ?? '';
  try {
    host = new URL(url ?? '').hostname.replace(/^www\./, '');
  } catch {
    // Resta il testo com'e'.
  }
  let hash = 0;
  for (const char of host) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash % 360;
}

export function monogramForUrl(url: string | null, name: string): string {
  try {
    const host = new URL(url ?? '').hostname.replace(/^www\./, '');
    return (host.charAt(0) || name.charAt(0) || '?').toUpperCase();
  } catch {
    return (name.charAt(0) || '?').toUpperCase();
  }
}

/** "2,4 MB" nella lingua dell'interfaccia. */
export function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}

/** Percorso lungo accorciato nel mezzo: "C:\dev\…\backend". */
export function shortenPath(path: string, max = 48): string {
  if (path.length <= max) return path;
  const separator = path.includes('\\') ? '\\' : '/';
  const parts = path.split(separator);
  if (parts.length <= 3) return `${path.slice(0, max - 1)}…`;
  const head = parts.slice(0, 2).join(separator);
  let tail = parts.at(-1) ?? '';
  for (let index = parts.length - 2; index > 1; index -= 1) {
    const candidate = `${parts[index]}${separator}${tail}`;
    if (head.length + candidate.length + 3 > max) break;
    tail = candidate;
  }
  return `${head}${separator}…${separator}${tail}`;
}
