import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { open } from '@tauri-apps/plugin-dialog';
import { Check, ImagePlus, Monitor, Moon, Sun, Trash2 } from 'lucide-react';
import { Button, GlassPanel } from '@/components/ui';
import { cn } from '@/lib/cn';
import { LAYOUT_IDS, springSnappy } from '@/lib/motion';
import { ipc, isTauri } from '@/lib/ipc';
import { useSessionStore } from '@/stores/sessionStore';
import {
  backgroundStyle,
  BUILTIN_GRADIENTS,
  useBackgroundStore,
} from '@/features/backgrounds/backgroundStore';
import { SettingRow } from '../SettingRow';
import { ScopeToggle } from '../ScopeToggle';
import type { ThemeMode } from '@/types/domain';

const THEMES: { value: ThemeMode; icon: typeof Sun; labelKey: string }[] = [
  { value: 'light', icon: Sun, labelKey: 'settings.themeLight' },
  { value: 'dark', icon: Moon, labelKey: 'settings.themeDark' },
  { value: 'system', icon: Monitor, labelKey: 'settings.themeSystem' },
];

export function AppearanceTab() {
  const { t } = useTranslation();
  const settings = useSessionStore((state) => state.settings);
  const updateSetting = useSessionStore((state) => state.updateSetting);

  const backgrounds = useBackgroundStore((state) => state.backgrounds);
  const loadBackgrounds = useBackgroundStore((state) => state.load);
  const removeBackground = useBackgroundStore((state) => state.remove);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadBackgrounds();
  }, [loadBackgrounds]);

  if (!settings) return <></>;

  const selectedId = settings.backgroundId;

  /** Registra un gradiente incluso solo quando l'utente lo sceglie davvero. */
  const chooseGradient = async (gradient: (typeof BUILTIN_GRADIENTS)[number]) => {
    if (!isTauri()) return;
    const existing = backgrounds.find(
      (background) => background.source === 'builtin' && background.name === gradient.name,
    );

    const background =
      existing ?? (await ipc.createBackground(gradient.name, 'builtin', gradient.value));

    await loadBackgrounds();
    await updateSetting('backgroundId', background.id);
  };

  const importImage = async () => {
    if (!isTauri()) return;
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Immagini', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }],
    });
    if (typeof selected !== 'string') return;

    setBusy(true);
    try {
      const background = await ipc.importBackgroundImage(selected);
      await loadBackgrounds();
      await updateSetting('backgroundId', background.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <GlassPanel radius="3xl" className="divide-y divide-black/5 dark:divide-white/[0.06]">
        <SettingRow
          title={t('settings.theme')}
          description={t('settings.themeDesc')}
          scopeKey="theme"
        >
          <div className="relative flex gap-1 rounded-full bg-black/[0.05] p-1 dark:bg-white/[0.06]">
            {THEMES.map(({ value, icon: Icon, labelKey }) => {
              const isActive = settings.theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => void updateSetting('theme', value)}
                  className={cn(
                    'relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium',
                    isActive
                      ? 'text-zinc-900 dark:text-zinc-50'
                      : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200',
                  )}
                >
                  {isActive && (
                    <motion.span
                      layoutId={LAYOUT_IDS.themePill}
                      transition={springSnappy}
                      className="absolute inset-0 -z-10 rounded-full bg-white/80 shadow-sm dark:bg-white/[0.14]"
                    />
                  )}
                  <Icon strokeWidth={1.75} className="size-3.5" />
                  {t(labelKey)}
                </button>
              );
            })}
          </div>
        </SettingRow>

        <SettingRow
          title={t('settings.overlayOpacity')}
          description={t('settings.overlayOpacityDesc')}
          scopeKey="overlayOpacity"
        >
          <input
            type="range"
            min={0}
            max={70}
            step={5}
            value={settings.overlayOpacity}
            onChange={(event) => void updateSetting('overlayOpacity', Number(event.target.value))}
            className="w-40 accent-indigo-400"
          />
        </SettingRow>
      </GlassPanel>

      {/* Galleria degli sfondi */}
      <GlassPanel radius="3xl" className="flex flex-col gap-4 p-5">
        <header className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              {t('appearance.wallpaper')}
            </span>
            <span className="text-xs text-zinc-500">{t('appearance.wallpaperHint')}</span>
          </div>
          <div className="flex items-center gap-3">
            <ScopeToggle settingKey="backgroundId" />
            <Button size="sm" onClick={() => void importImage()} isLoading={busy}>
              <ImagePlus strokeWidth={1.75} className="size-3.5" />
              {t('appearance.importImage')}
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* Default animato */}
          <button
            type="button"
            onClick={() => void updateSetting('backgroundId', null)}
            className={cn(
              'group relative aspect-video overflow-hidden rounded-2xl border',
              selectedId === null
                ? 'border-white/60 ring-2 ring-white/40'
                : 'border-black/10 dark:border-white/10',
            )}
          >
            <span className="absolute inset-0 bg-gradient-to-br from-indigo-400/60 via-violet-500/50 to-cyan-400/60" />
            <span className="absolute inset-x-0 bottom-0 bg-black/40 px-2 py-1 text-[0.625rem] text-white">
              {t('appearance.defaultMesh')}
            </span>
            {selectedId === null && (
              <Check strokeWidth={3} className="absolute top-2 right-2 size-4 text-white" />
            )}
          </button>

          {/* Gradienti inclusi */}
          {BUILTIN_GRADIENTS.map((gradient) => {
            const stored = backgrounds.find(
              (background) => background.source === 'builtin' && background.name === gradient.name,
            );
            const isActive = !!stored && stored.id === selectedId;

            return (
              <button
                key={gradient.id}
                type="button"
                onClick={() => void chooseGradient(gradient)}
                className={cn(
                  'relative aspect-video overflow-hidden rounded-2xl border',
                  isActive
                    ? 'border-white/60 ring-2 ring-white/40'
                    : 'border-black/10 dark:border-white/10',
                )}
                style={{ backgroundImage: gradient.value }}
              >
                <span className="absolute inset-x-0 bottom-0 bg-black/40 px-2 py-1 text-[0.625rem] text-white">
                  {gradient.name}
                </span>
                {isActive && (
                  <Check strokeWidth={3} className="absolute top-2 right-2 size-4 text-white" />
                )}
              </button>
            );
          })}

          {/* Immagini importate dall'utente */}
          {backgrounds
            .filter((background) => background.source === 'file')
            .map((background) => (
              <div key={background.id} className="group relative">
                <button
                  type="button"
                  onClick={() => void updateSetting('backgroundId', background.id)}
                  className={cn(
                    'relative aspect-video w-full overflow-hidden rounded-2xl border',
                    background.id === selectedId
                      ? 'border-white/60 ring-2 ring-white/40'
                      : 'border-black/10 dark:border-white/10',
                  )}
                  style={backgroundStyle(background)}
                >
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/40 px-2 py-1 text-[0.625rem] text-white">
                    {background.name}
                  </span>
                  {background.id === selectedId && (
                    <Check strokeWidth={3} className="absolute top-2 right-2 size-4 text-white" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => void removeBackground(background.id)}
                  aria-label={t('common.delete')}
                  className="absolute top-1.5 left-1.5 rounded-lg bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 strokeWidth={2} className="size-3" />
                </button>
              </div>
            ))}
        </div>
      </GlassPanel>
    </div>
  );
}
