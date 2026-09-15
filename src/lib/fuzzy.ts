/* Corrispondenza approssimata per gli elenchi piccoli del frontend (i comandi
   della palette). La ricerca nella libreria vive in Rust con le stesse idee. */

/** Minuscolo e senza accenti, un carattere per carattere. */
export function fold(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Punteggio da 0 a 1 di `query` dentro `text`: tutte le parole della richiesta
 * devono comparire (inizio, inizio di parola o dentro). 0 = non corrisponde.
 */
export function scoreText(query: string, text: string): number {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  const haystack = fold(text);
  let total = 0;
  for (const word of words) {
    const index = haystack.indexOf(word);
    if (index < 0) return 0;
    const boundary = index === 0 || !/[\p{L}\p{N}]/u.test(haystack[index - 1] ?? '');
    total += index === 0 ? 1 : boundary ? 0.85 : 0.6;
  }
  return total / words.length;
}
