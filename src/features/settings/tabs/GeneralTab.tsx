import { useTranslation } from 'react-i18next';
import { Button, GlassPanel, Switch } from '@/components/ui';
import { setLanguage, SUPPORTED_LANGUAGES } from '@/lib/i18n';
import { useSessionStore } from '@/stores/sessionStore';
import { SettingRow } from '../SettingRow';
import type { Language } from '@/types/domain';

export function GeneralTab() {
  const { t } = useTranslation();
  const settings = useSessionStore((state) => state.settings);
  const updateSetting = useSessionStore((state) => state.updateSetting);

  if (!settings) return <></>;

  const changeLanguage = (language: Language) => {
    void setLanguage(language);
    void updateSetting('language', language);
  };

  return (
    <GlassPanel radius="3xl" className="divide-y divide-black/5 dark:divide-white/[0.06]">
      <SettingRow
        title={t('settings.language')}
        description={t('settings.languageDesc')}
        scopeKey="language"
      >
        <div className="flex gap-1.5">
          {SUPPORTED_LANGUAGES.map((language) => (
            <Button
              key={language}
              size="sm"
              variant={settings.language === language ? 'accent' : 'ghost'}
              onClick={() => changeLanguage(language)}
              className="uppercase"
            >
              {language}
            </Button>
          ))}
        </div>
      </SettingRow>

      <SettingRow
        title={t('settings.startMinimized')}
        description={t('settings.startMinimizedDesc')}
      >
        <Switch
          checked={settings.startMinimized}
          onCheckedChange={(checked) => void updateSetting('startMinimized', checked)}
          aria-label={t('settings.startMinimized')}
        />
      </SettingRow>

      <SettingRow title={t('settings.closeToTray')} description={t('settings.closeToTrayDesc')}>
        <Switch
          checked={settings.closeToTray}
          onCheckedChange={(checked) => void updateSetting('closeToTray', checked)}
          aria-label={t('settings.closeToTray')}
        />
      </SettingRow>

      <SettingRow title={t('settings.autostart')} description={t('settings.autostartDesc')}>
        <Switch
          checked={settings.autostart}
          onCheckedChange={(checked) => void updateSetting('autostart', checked)}
          aria-label={t('settings.autostart')}
        />
      </SettingRow>

      <SettingRow
        title={t('settings.openDelay')}
        description={t('settings.openDelayDesc')}
        scopeKey="openDelayMs"
      >
        <input
          type="number"
          min={0}
          max={3000}
          step={50}
          value={settings.openDelayMs}
          onChange={(event) => void updateSetting('openDelayMs', Number(event.target.value))}
          className="h-9 w-24 rounded-xl bg-black/[0.04] px-3 text-sm dark:bg-white/[0.05]"
        />
      </SettingRow>

      <SettingRow
        title={t('health.threshold')}
        description={t('health.thresholdDesc')}
        scopeKey="staleLinkDays"
      >
        <input
          type="number"
          min={7}
          max={730}
          step={1}
          value={settings.staleLinkDays}
          onChange={(event) => void updateSetting('staleLinkDays', Number(event.target.value))}
          className="h-9 w-24 rounded-xl bg-black/[0.04] px-3 text-sm dark:bg-white/[0.05]"
        />
      </SettingRow>
    </GlassPanel>
  );
}
