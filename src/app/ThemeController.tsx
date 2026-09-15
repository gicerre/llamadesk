import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useWorkspaces } from '@/lib/queries';
import { workspaceFromPath } from '@/lib/routes';
import { useOpener } from '@/stores/opener';
import { useSession } from '@/stores/session';
import { useUi } from '@/stores/ui';
import { applyAppearance, setAccent } from './appearance';

/**
 * Riflette sull'interfaccia le impostazioni e il contesto: tema, densita',
 * materiale e accento del workspace corrente (docs/REDESIGN.md § 10).
 */
export function ThemeController() {
  const theme = useSession((state) => state.settings?.theme ?? 'system');
  const density = useSession((state) => state.settings?.density ?? 'comfortable');
  const material = useSession((state) => state.windowMaterial);
  const { pathname } = useLocation();
  const lastWorkspaceId = useUi((state) => state.lastWorkspaceId);
  const workspaces = useWorkspaces();

  useEffect(() => {
    const apply = () => applyAppearance({ theme, density, material });
    apply();
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme, density, material]);

  const workspaceId = workspaceFromPath(pathname) ?? lastWorkspaceId;
  const color =
    workspaces.data?.find((entry) => entry.node.id === workspaceId)?.node.colorMain ?? null;

  // Durante l'apertura l'accento resta Titicaca; poi sfuma in quello del workspace.
  const building = useOpener((state) => state.phase === 'build' || state.phase === 'pending');
  useEffect(() => setAccent(building ? null : color), [building, color]);

  return null;
}
