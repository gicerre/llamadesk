import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconPicker } from '@/components/IconPicker';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { Button } from '@/components/ui/Button';
import { ColorField, Segmented, TextField } from '@/components/ui/fields';
import { api } from '@/lib/ipc';
import { setLanguage, SUPPORTED_LANGUAGES, type Language } from '@/lib/i18n';
import { useActiveProfile, useSession } from '@/stores/session';
import { toastError } from '@/stores/toasts';
import { StepActions, StepHeader } from './OnboardingFlow';

/**
 * Primo passo: chi sta usando LlamaDesk. Il profilo esiste gia' (lo crea il
 * primo avvio): qui prende nome, avatar, colore e lingua. La lingua e' una
 * preferenza del profilo, e parte dall'inglese.
 */
export function ProfileStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const profile = useActiveProfile();
  const refreshProfiles = useSession((state) => state.refreshProfiles);
  const updateSetting = useSession((state) => state.updateSetting);
  const settings = useSession((state) => state.settings);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [language, setLocalLanguage] = useState<Language>(
    (SUPPORTED_LANGUAGES.includes(settings?.language as Language)
      ? (settings?.language as Language)
      : 'en') satisfies Language,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!profile) return null;
  const preview = {
    name: name.trim() || t('onboarding.profile.you'),
    colorMain: color,
    avatarIcon: icon,
  };

  // La lingua si applica subito: il passo successivo e' gia' nella lingua scelta.
  const chooseLanguage = (next: Language) => {
    setLocalLanguage(next);
    void setLanguage(next);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(t('create.nameRequired'));
      return;
    }
    setBusy(true);
    try {
      await api.updateProfile(profile.id, {
        name: name.trim(),
        avatarIcon: icon,
        colorMain: color,
      });
      await updateSetting('language', language, 'profile');
      await refreshProfiles();
      onDone();
    } catch (failure) {
      setBusy(false);
      toastError(t('settings.saveFailed'), failure);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <StepHeader title={t('onboarding.profile.title')} lead={t('onboarding.profile.lead')} />

      <div className="bg-surface shadow-1 flex flex-col gap-5 rounded-xl p-5">
        <div className="flex items-center gap-4">
          <ProfileAvatar profile={preview} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <IconPicker
              value={icon}
              onChange={setIcon}
              defaultLabel={t('onboarding.profile.avatarInitials')}
              preview={(candidate) => (
                <ProfileAvatar profile={{ ...preview, avatarIcon: candidate }} size="xs" />
              )}
            />
            <p className="text-ink-3 text-xs">{t('onboarding.profile.avatarHint')}</p>
          </div>
        </div>

        <TextField
          label={t('onboarding.profile.nameLabel')}
          placeholder={t('onboarding.profile.namePlaceholder')}
          value={name}
          autoFocus
          error={error}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />

        <ColorField
          label={t('create.color')}
          value={color}
          onChange={setColor}
          presetLabel={(key) => t(`colors.${key}`)}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-ink-2 text-xs font-semibold">{t('settings.language')}</span>
          <Segmented
            label={t('settings.language')}
            value={language}
            onChange={chooseLanguage}
            options={[
              { value: 'en', label: 'English' },
              { value: 'it', label: 'Italiano' },
            ]}
          />
          <p className="text-ink-3 text-xs">{t('onboarding.profile.languageHint')}</p>
        </div>
      </div>

      <StepActions>
        <Button variant="primary" size="lg" type="submit" disabled={busy}>
          {t('onboarding.profile.submit')}
        </Button>
      </StepActions>
    </form>
  );
}
