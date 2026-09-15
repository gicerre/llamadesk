import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router-dom';
import { EyeOff, HardDrive, Sparkles } from 'lucide-react';
import { BrandMark } from '@/components/brand/BrandMark';
import { Button } from '@/components/ui/Button';
import { ColorField, TextField } from '@/components/ui/fields';
import { COLOR_PRESETS } from '@/lib/identity';
import { useCreateNode, useWorkspaces } from '@/lib/queries';
import { paths } from '@/lib/routes';
import { useSession } from '@/stores/session';
import { setAccent } from '@/app/appearance';
import { WindowControls } from '@/app/shell/WindowControls';

const PRINCIPLES = [
  { key: 'local', icon: HardDrive },
  { key: 'private', icon: EyeOff },
  { key: 'yours', icon: Sparkles },
] as const;

/**
 * Benvenuto: si arriva qui quando il profilo non vede ancora nessun
 * workspace (primo avvio, o profilo appena creato). Un solo passo: dare un
 * nome e un colore al primo workspace.
 */
export function WelcomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workspaces = useWorkspaces();
  const createNode = useCreateNode();
  const isFirstRun = useSession((state) => state.isFirstRun);
  const completeWelcome = useSession((state) => state.completeWelcome);

  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_PRESETS[0]?.hex ?? null);
  const [error, setError] = useState<string | null>(null);

  // Il colore scelto e' gia' l'accento: si vede subito che cosa cambia.
  useEffect(() => setAccent(color), [color]);

  if ((workspaces.data ?? []).length > 0) return <Navigate to={paths.root} replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(t('create.nameRequired'));
      return;
    }
    try {
      const workspace = await createNode.mutateAsync({
        parentId: null,
        input: { kind: 'workspace', name, ...(color ? { colorMain: color } : {}) },
      });
      if (isFirstRun) await completeWelcome();
      navigate(paths.workspace(workspace.id), { replace: true });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <div className="bg-canvas flex h-full flex-col">
      <header data-tauri-drag-region className="flex h-10 shrink-0 justify-end">
        <WindowControls />
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-6 pb-10">
        <div className="flex w-full max-w-[460px] flex-col">
          <BrandMark size={56} tile />
          <h1 className="font-display text-ink mt-6 text-2xl font-semibold tracking-[-0.015em] text-balance">
            {t('welcome.title')}
          </h1>
          <p className="text-ink-2 mt-2 text-base">{t('welcome.lead')}</p>

          <form
            onSubmit={(event) => void submit(event)}
            className="bg-surface shadow-1 mt-7 flex flex-col gap-5 rounded-xl p-5"
          >
            <TextField
              label={t('welcome.nameLabel')}
              placeholder={t('create.placeholder.workspace')}
              hint={t('welcome.nameHint')}
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
            <Button variant="primary" size="lg" type="submit" disabled={createNode.isPending}>
              {t('welcome.submit')}
            </Button>
          </form>

          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PRINCIPLES.map(({ key, icon: Icon }) => (
              <li key={key} className="text-ink-3 flex gap-2 text-xs">
                <Icon className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  <span className="text-ink-2 block font-semibold">
                    {t(`welcome.principles.${key}.title`)}
                  </span>
                  {t(`welcome.principles.${key}.text`)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
