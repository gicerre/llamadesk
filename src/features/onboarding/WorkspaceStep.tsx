import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ImagePlus, X } from 'lucide-react';
import { AccentCover } from '@/components/Cover';
import { IconPicker } from '@/components/IconPicker';
import { NodeIcon } from '@/components/NodeIcon';
import { Button } from '@/components/ui/Button';
import { ColorField, Segmented, TextField } from '@/components/ui/fields';
import { COLOR_PRESETS } from '@/lib/identity';
import { api, isTauri } from '@/lib/ipc';
import { pickImage } from '@/lib/pickers';
import { useCreateNode } from '@/lib/queries';
import { setAccent } from '@/app/appearance';
import { StepActions, StepHeader } from './OnboardingFlow';

/**
 * Ultimo passo: il primo workspace, che e' un workspace vero (nome, colore,
 * icona, cover). La cover predefinita e' la sfumatura del colore scelto; nel
 * programma installato si puo' scegliere un'immagine.
 */
export function WorkspaceStep({
  first,
  onCreated,
}: {
  first: boolean;
  onCreated: (workspaceId: string) => void;
}) {
  const { t } = useTranslation();
  const createNode = useCreateNode();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(COLOR_PRESETS[0]?.hex ?? null);
  const [cover, setCover] = useState<'accent' | 'image'>('accent');
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Il colore scelto e' gia' l'accento dell'app: si vede subito che cosa cambia.
  useEffect(() => setAccent(color), [color]);

  const shownName = name.trim() || t('create.placeholder.workspace');

  const chooseImage = async () => {
    const path = await pickImage();
    if (!path) return;
    setImagePath(path);
    setCover('image');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(t('create.nameRequired'));
      return;
    }
    setBusy(true);
    try {
      const workspace = await createNode.mutateAsync({
        parentId: null,
        input: {
          kind: 'workspace',
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          ...(icon ? { icon } : {}),
          ...(color ? { colorMain: color } : {}),
        },
      });
      if (cover === 'image' && imagePath) {
        await api.setNodeCover(workspace.id, imagePath);
      }
      onCreated(workspace.id);
    } catch (failure) {
      setBusy(false);
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)}>
      <StepHeader
        title={first ? t('onboarding.workspace.title') : t('onboarding.workspace.titleAgain')}
        lead={t('onboarding.workspace.lead')}
      />

      <div className="bg-surface shadow-1 overflow-hidden rounded-xl">
        <AccentCover color={color} className="h-24" />
        <div className="-mt-7 flex items-end gap-3 px-5">
          <NodeIcon kind="workspace" name={shownName} icon={icon} color={color} size="lg" />
          <span className="min-w-0 pb-1">
            <span className="font-display text-ink block truncate text-lg font-semibold">
              {shownName}
            </span>
            <span className="text-ink-3 block truncate text-xs">
              {description.trim() || t('onboarding.workspace.descriptionPlaceholder')}
            </span>
          </span>
        </div>

        <div className="flex flex-col gap-5 p-5">
          <TextField
            label={t('onboarding.workspace.nameLabel')}
            placeholder={t('create.placeholder.workspace')}
            value={name}
            autoFocus
            error={error}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
          />
          <TextField
            label={t('inspector.description')}
            placeholder={t('onboarding.workspace.descriptionPlaceholder')}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <IconPicker
            label={t('inspector.icon')}
            defaultLabel={t('inspector.iconDefault')}
            value={icon}
            onChange={setIcon}
            preview={(candidate) => (
              <NodeIcon
                kind="workspace"
                name={shownName}
                icon={candidate}
                color={color}
                size="xs"
              />
            )}
          />
          <ColorField
            label={t('create.color')}
            value={color}
            onChange={setColor}
            presetLabel={(key) => t(`colors.${key}`)}
          />

          <div className="flex flex-col gap-1.5">
            <span className="text-ink-2 text-xs font-semibold">{t('cover.label')}</span>
            {isTauri() ? (
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  label={t('cover.label')}
                  value={cover}
                  onChange={(next) => {
                    if (next === 'image' && !imagePath) void chooseImage();
                    else setCover(next);
                  }}
                  options={[
                    { value: 'accent', label: t('cover.accent') },
                    { value: 'image', label: t('cover.image') },
                  ]}
                />
                {cover === 'image' && imagePath && (
                  <>
                    <span className="text-ink-3 max-w-[220px] truncate font-mono text-xs">
                      {imagePath.split(/[\\/]/).pop()}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      iconOnly
                      aria-label={t('cover.remove')}
                      onClick={() => {
                        setImagePath(null);
                        setCover('accent');
                      }}
                    >
                      <X />
                    </Button>
                  </>
                )}
                {cover === 'accent' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void chooseImage()}
                  >
                    <ImagePlus />
                    {t('cover.choose')}
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-ink-3 text-xs">{t('cover.accentOnly')}</p>
            )}
          </div>
        </div>
      </div>

      <StepActions>
        <Button variant="primary" size="lg" type="submit" disabled={busy}>
          {t('onboarding.workspace.submit')}
        </Button>
      </StepActions>
    </form>
  );
}
