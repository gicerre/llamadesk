import { describe, expect, it } from 'vitest';
import { acceleratorFromEvent, displayAccelerator } from './accelerators';

const press = (
  code: string,
  modifiers: Partial<Record<'ctrlKey' | 'altKey' | 'shiftKey', boolean>> = {},
) =>
  acceleratorFromEvent({
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    code,
    ...modifiers,
  });

describe('acceleratorFromEvent', () => {
  it('builds Tauri accelerators', () => {
    expect(press('Space', { ctrlKey: true, altKey: true })).toBe('CmdOrCtrl+Alt+Space');
    expect(press('KeyL', { ctrlKey: true, shiftKey: true })).toBe('CmdOrCtrl+Shift+L');
    expect(press('Digit3', { altKey: true })).toBe('Alt+3');
    expect(press('F9')).toBe('F9');
  });

  it('refuses keys that would steal typing from other apps', () => {
    expect(press('KeyA')).toBeNull();
    expect(press('KeyA', { shiftKey: true })).toBeNull();
    expect(press('ControlLeft', { ctrlKey: true })).toBeNull();
    expect(press('NumpadMultiply', { ctrlKey: true })).toBeNull();
  });

  it('shows accelerators the Windows way', () => {
    expect(displayAccelerator('CmdOrCtrl+Alt+Space')).toBe('Ctrl+Alt+Space');
  });
});
