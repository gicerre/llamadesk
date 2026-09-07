import { useEffect } from 'react';
import { useSessionStore } from '@/stores/sessionStore';

/**
 * Applica il tema all'<html>. Nessuno stato locale: la verità è nel database,
 * qui si riflette soltanto. `system` resta agganciato al media query di Windows.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSessionStore((state) => state.settings?.theme ?? 'system');

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && media.matches);
      root.classList.toggle('dark', isDark);
      root.style.colorScheme = isDark ? 'dark' : 'light';
    };

    apply();
    if (theme !== 'system') return;

    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  return children;
}
