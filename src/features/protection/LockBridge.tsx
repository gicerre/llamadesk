import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { api, isTauri } from '@/lib/ipc';
import { invalidateEverything, useLockStatus } from '@/lib/queries';
import { useLockDialogs } from '@/stores/lock';
import { useProfileId } from '@/stores/session';
import { lockNow } from './lock';

/** Rust ha bloccato la sessione (finestra nella tray, Ctrl+L da un'altra parte). */
const LOCKED_EVENT = 'llamadesk://locked';

/** Ogni quanto, al massimo, dire a Rust che l'utente c'e'. */
const TOUCH_EVERY_MS = 20_000;

/**
 * Collega la protezione alla finestra: l'uso rimanda il blocco automatico,
 * `Ctrl+L` blocca, e quando Rust blocca l'interfaccia si rilegge.
 */
export function LockBridge() {
  const profileId = useProfileId();
  const status = useLockStatus();
  const unlocked = status.data?.unlocked ?? false;
  const hasLock = status.data?.hasLock ?? false;
  const lastTouch = useRef(0);
  const wasUnlocked = useRef(unlocked);

  // Da sbloccato a bloccato (inattivita' scoperta dal controllo periodico).
  useEffect(() => {
    if (wasUnlocked.current && !unlocked) void invalidateEverything();
    wasUnlocked.current = unlocked;
  }, [unlocked]);

  useEffect(() => {
    const onActivity = () => {
      if (!hasLock || !unlocked || !profileId) return;
      const now = Date.now();
      if (now - lastTouch.current < TOUCH_EVERY_MS) return;
      lastTouch.current = now;
      void api.touchSession(profileId).catch(() => undefined);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      onActivity();
      if (!event.ctrlKey || event.altKey || event.key.toLowerCase() !== 'l') return;
      event.preventDefault();
      if (!hasLock) return;
      if (unlocked) void lockNow();
      else useLockDialogs.getState().openUnlock();
    };
    window.addEventListener('pointerdown', onActivity);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onActivity);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [hasLock, unlocked, profileId]);

  useEffect(() => {
    if (!isTauri()) return;
    const pending = listen(LOCKED_EVENT, () => void invalidateEverything());
    return () => void pending.then((unlisten) => unlisten());
  }, []);

  return null;
}
