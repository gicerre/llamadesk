/* Scorciatoie globali nel formato di Tauri ("CmdOrCtrl+Alt+Space"). */

/** "CmdOrCtrl+Alt+Space" → "Ctrl+Alt+Space": come lo scrive Windows. */
export function displayAccelerator(accelerator: string) {
  return accelerator.replace(/CmdOrCtrl|CommandOrControl/g, 'Ctrl');
}

const CODE_NAMES: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Comma: ',',
  Period: '.',
  Slash: '/',
  Semicolon: ';',
  Quote: "'",
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
};

/**
 * La combinazione di un tasto premuto, nel formato di Tauri. Serve almeno un
 * modificatore (Ctrl o Alt): una scorciatoia globale senza ruberebbe il tasto
 * a tutte le altre applicazioni.
 */
export function acceleratorFromEvent(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey' | 'code'>,
) {
  const { code } = event;
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(code)) return null;
  const key = /^Key[A-Z]$/.test(code)
    ? code.slice(3)
    : /^Digit\d$/.test(code)
      ? code.slice(5)
      : /^F\d{1,2}$/.test(code)
        ? code
        : (CODE_NAMES[code] ?? null);
  if (!key) return null;
  const isFunctionKey = /^F\d{1,2}$/.test(key);
  if (!event.ctrlKey && !event.altKey && !isFunctionKey) return null;
  return [event.ctrlKey && 'CmdOrCtrl', event.altKey && 'Alt', event.shiftKey && 'Shift', key]
    .filter(Boolean)
    .join('+');
}
