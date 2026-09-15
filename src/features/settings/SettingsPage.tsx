import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Segmented, Switch } from '@/components/ui/fields';
import { useSession } from '@/stores/session';
import { toastError } from '@/stores/toasts';
import type { AppSettings } from '@/types/generated/AppSettings';
import { PageFrame } from '../library/parts';
import { Group, Row } from './parts';
import { ToolsSettings } from './ToolsSettings';

/**
 * Impostazioni essenziali. Scorciatoie, protezione e dati arrivano con le fasi
 * che li introducono; qui solo cio' che l'app usa gia'.
 */
export function SettingsPage() {
  const { t } = useTranslation();
  const settings = useSession((state) => state.settings);
  const overrides = useSession((state) => state.overrides);
  const updateSetting = useSession((state) => state.updateSetting);
  const appVersion = useSession((state) => state.appVersion);
  const dbPath = useSession((state) => state.dbPath);
  const windowMaterial = useSession((state) => state.windowMaterial);

  if (!settings) return null;

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    void updateSetting(key, value).catch((error) => toastError(t('settings.saveFailed'), error));

  return (
    <PageFrame className="max-w-2xl">
      <h1 className="font-display text-ink text-2xl font-semibold tracking-[-0.015em]">
        {t('nav.settings')}
      </h1>

      <Group title={t('settings.appearance')}>
        <Row
          label={t('settings.theme')}
          note={overrides.includes('theme') ? t('settings.profileOverride') : undefined}
          control={(id) => (
            <span id={id}>
              <Segmented
                label={t('settings.theme')}
                value={settings.theme as 'system' | 'light' | 'dark'}
                onChange={(value) => set('theme', value)}
                options={[
                  { value: 'system', label: t('settings.themeSystem'), icon: <Monitor /> },
                  { value: 'light', label: t('settings.themeLight'), icon: <Sun /> },
                  { value: 'dark', label: t('settings.themeDark'), icon: <Moon /> },
                ]}
              />
            </span>
          )}
        />
        <Row
          label={t('settings.language')}
          control={(id) => (
            <span id={id}>
              <Segmented
                label={t('settings.language')}
                value={settings.language as 'it' | 'en'}
                onChange={(value) => set('language', value)}
                options={[
                  { value: 'it', label: 'Italiano' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </span>
          )}
        />
        <Row
          label={t('settings.density')}
          hint={t('settings.densityHint')}
          control={(id) => (
            <span id={id}>
              <Segmented
                label={t('settings.density')}
                value={settings.density as 'comfortable' | 'compact'}
                onChange={(value) => set('density', value)}
                options={[
                  { value: 'comfortable', label: t('settings.densityComfortable') },
                  { value: 'compact', label: t('settings.densityCompact') },
                ]}
              />
            </span>
          )}
        />
      </Group>

      <Group title={t('settings.general')}>
        {(
          [
            ['autostart', 'settings.autostart', 'settings.autostartHint'],
            ['startMinimized', 'settings.startMinimized', 'settings.startMinimizedHint'],
            ['closeToTray', 'settings.closeToTray', 'settings.closeToTrayHint'],
            ['openerAnimation', 'settings.openerAnimation', 'settings.openerAnimationHint'],
          ] as const
        ).map(([key, label, hint]) => (
          <Row
            key={key}
            label={t(label)}
            hint={t(hint)}
            control={(id) => (
              <Switch
                id={id}
                checked={settings[key]}
                onCheckedChange={(value) => set(key, value)}
              />
            )}
          />
        ))}
      </Group>

      <ToolsSettings />

      <Group title={t('settings.about')}>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 px-4 py-3 text-sm">
          <dt className="text-ink-3">{t('settings.version')}</dt>
          <dd className="selectable text-ink tabular-nums">{appVersion}</dd>
          <dt className="text-ink-3">{t('settings.database')}</dt>
          <dd className="selectable text-ink font-mono text-xs break-all">{dbPath}</dd>
          <dt className="text-ink-3">{t('settings.material')}</dt>
          <dd className="text-ink">
            {windowMaterial === 'mica' ? t('settings.materialMica') : t('settings.materialSolid')}
          </dd>
        </dl>
        <p className="border-line text-ink-3 border-t px-4 py-3 text-xs">{t('settings.privacy')}</p>
      </Group>
    </PageFrame>
  );
}
