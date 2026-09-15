/* ============================================================================
   Identita' visiva degli oggetti: colori dei workspace e iniziali.
   ========================================================================== */

export interface ColorPreset {
  key: string;
  hex: string;
}

/** I 12 colori proposti per workspace e progetti (docs/REDESIGN.md § 10). */
export const COLOR_PRESETS: readonly ColorPreset[] = [
  { key: 'cobalt', hex: '#3C62C4' },
  { key: 'lagoon', hex: '#1D7384' },
  { key: 'sage', hex: '#4F7F5B' },
  { key: 'moss', hex: '#6B7A2E' },
  { key: 'ochre', hex: '#A8741A' },
  { key: 'clay', hex: '#B0553A' },
  { key: 'ruby', hex: '#A23B4F' },
  { key: 'plum', hex: '#7A4B8C' },
  { key: 'slate', hex: '#4E5D6C' },
  { key: 'night', hex: '#2E3A59' },
  { key: 'sand', hex: '#8C7B62' },
  { key: 'graphite', hex: '#3A3F44' },
];

/** Colore del brand: l'accento quando nessun workspace ne impone uno. */
export const BRAND_COLOR = '#1D7384';

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#abc`, `abc`, `#AABBCC` → `#aabbcc`; qualunque altra cosa → `null`. */
export function normalizeHex(value: string | null | undefined): string | null {
  const match = HEX.exec((value ?? '').trim());
  if (!match?.[1]) return null;
  const digits = match[1];
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  return `#${full.toLowerCase()}`;
}

/** Il prossimo colore da proporre: il primo non ancora usato, poi a rotazione. */
export function suggestColor(used: readonly (string | null)[]): string {
  const taken = new Set(used.map(normalizeHex).filter(Boolean));
  const free = COLOR_PRESETS.find((preset) => !taken.has(normalizeHex(preset.hex)));
  return (free ?? COLOR_PRESETS[used.length % COLOR_PRESETS.length] ?? COLOR_PRESETS[0])!.hex;
}

/**
 * Iniziali per le tessere senza icona: "SpecialHub" → "SH", "Cliente Rossi" →
 * "CR", "Lavoro" → "L". Al massimo due lettere.
 */
export function initials(name: string): string {
  const words = name
    .trim()
    .split(/[\s._-]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';

  if (words.length === 1) {
    const word = words[0] as string;
    const capitals = word.match(/\p{Lu}/gu) ?? [];
    if (capitals.length >= 2) return capitals.slice(0, 2).join('');
    return (Array.from(word)[0] ?? '?').toUpperCase();
  }

  return words
    .slice(0, 2)
    .map((word) => (Array.from(word)[0] ?? '').toUpperCase())
    .join('');
}
