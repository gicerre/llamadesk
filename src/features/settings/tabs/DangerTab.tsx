import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { Button, GlassPanel, Input } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ipc, isTauri } from '@/lib/ipc';
import { renderPrompt } from '@/features/danger-zone/prompt';
import { DangerBadge } from '@/features/danger-zone/DangerBadge';
import type { DangerLevel, DangerPrompt } from '@/types/domain';

const PLACEHOLDERS = ['project', 'environment', 'context', 'application', 'link', 'url'];

/** Valori d'esempio per l'anteprima: nessun dato reale dell'utente. */
const SAMPLE: Record<string, string> = {
  project: 'ACME',
  environment: 'PRODUZIONE',
  context: 'Cliente A',
  application: 'Camunda',
  link: 'Admin',
  url: 'https://acme.example/admin',
};

type Draft = {
  id?: string;
  name: string;
  level: Exclude<DangerLevel, 'normal'>;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  confirmWord: string;
};

const EMPTY: Draft = {
  name: '',
  level: 'danger',
  title: '',
  message: '',
  confirmLabel: '',
  cancelLabel: '',
  confirmWord: '',
};

export function DangerTab() {
  const { t } = useTranslation();
  const [prompts, setPrompts] = useState<DangerPrompt[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);

  const reload = () => {
    if (!isTauri()) return;
    void ipc
      .listDangerPrompts()
      .then(setPrompts)
      .catch(() => setPrompts([]));
  };

  useEffect(reload, []);

  const edit = (prompt: DangerPrompt) => {
    // Modificare un built-in ne crea una copia con testo letterale: l'originale
    // tradotto resta disponibile. Qui partiamo dai testi già risolti.
    const rendered = renderPrompt(prompt, SAMPLE, t);
    setDraft({
      id: prompt.isBuiltin ? undefined : prompt.id,
      name: prompt.isBuiltin ? `${t(`danger.levels.${prompt.level}`)} — custom` : prompt.name,
      level: prompt.level,
      title: prompt.isBuiltin ? t(prompt.title) : prompt.title,
      message: prompt.isBuiltin ? t(prompt.message) : prompt.message,
      confirmLabel: rendered.confirmLabel,
      cancelLabel: rendered.cancelLabel,
      confirmWord: rendered.confirmWord ?? '',
    });
  };

  const save = async () => {
    if (!draft || !isTauri()) return;
    await ipc.saveDangerPrompt({
      ...(draft.id ? { id: draft.id } : {}),
      name: draft.name.trim() || t('danger.protection'),
      level: draft.level,
      title: draft.title,
      message: draft.message,
      confirmLabel: draft.confirmLabel,
      cancelLabel: draft.cancelLabel,
      ...(draft.level === 'critical' && draft.confirmWord
        ? { confirmWord: draft.confirmWord }
        : {}),
    });
    setDraft(null);
    reload();
  };

  const preview = draft
    ? {
        title: draft.title.replace(/\{(\w+)\}/g, (match, key: string) => SAMPLE[key] ?? match),
        message: draft.message.replace(/\{(\w+)\}/g, (match, key: string) => SAMPLE[key] ?? match),
      }
    : null;

  return (
    <div className="flex flex-col gap-4">
      <GlassPanel radius="3xl" className="flex flex-col gap-3 p-5">
        <header className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
              {t('danger.promptsTitle')}
            </span>
            <span className="text-xs text-zinc-500">{t('danger.promptsHint')}</span>
          </div>
          <Button size="sm" onClick={() => setDraft({ ...EMPTY })}>
            <Plus strokeWidth={1.75} className="size-3.5" />
            {t('common.add')}
          </Button>
        </header>

        <ul className="flex flex-col gap-1.5">
          {prompts.map((prompt) => (
            <li
              key={prompt.id}
              className="flex items-center gap-3 rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]"
            >
              <DangerBadge level={prompt.level} compact />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm text-zinc-800 dark:text-zinc-100">
                  {prompt.isBuiltin ? t(`danger.levels.${prompt.level}`) : prompt.name}
                </span>
                <span className="truncate text-[0.6875rem] text-zinc-500">
                  {prompt.isBuiltin ? t(prompt.title) : prompt.title}
                </span>
              </span>

              {prompt.isBuiltin && (
                <span
                  title={t('danger.builtinLocked')}
                  className="flex items-center gap-1 text-[0.625rem] text-zinc-400"
                >
                  <Lock strokeWidth={2} className="size-3" />
                  {t('danger.builtin')}
                </span>
              )}

              <Button size="sm" variant="ghost" onClick={() => edit(prompt)}>
                {prompt.isBuiltin ? t('danger.duplicateToEdit') : t('common.edit')}
              </Button>

              {!prompt.isBuiltin && (
                <Button
                  size="icon"
                  variant="ghost"
                  title={t('common.delete')}
                  onClick={() => void ipc.deleteDangerPrompt(prompt.id).then(reload)}
                >
                  <Trash2 strokeWidth={1.75} className="size-3.5" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </GlassPanel>

      {draft && (
        <GlassPanel radius="3xl" className="flex flex-col gap-4 p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label={t('editor.name')}
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <div className="flex flex-col gap-1.5">
              <span className="px-1 text-xs font-medium text-zinc-500">
                {t('danger.protection')}
              </span>
              <div className="flex gap-1">
                {(['warning', 'danger', 'critical'] as const).map((level) => (
                  <Button
                    key={level}
                    size="sm"
                    variant={draft.level === level ? 'accent' : 'ghost'}
                    onClick={() => setDraft({ ...draft, level })}
                  >
                    {t(`danger.levels.${level}`)}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <Input
            label={t('danger.promptTitle')}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />

          <div className="flex flex-col gap-1.5">
            <span className="px-1 text-xs font-medium text-zinc-500">
              {t('danger.promptMessage')}
            </span>
            <textarea
              value={draft.message}
              onChange={(event) => setDraft({ ...draft, message: event.target.value })}
              rows={3}
              className={cn(
                'w-full resize-none rounded-xl px-3.5 py-2.5 text-sm',
                'bg-black/[0.04] dark:bg-white/[0.05]',
                'focus:ring-2 focus:ring-black/10 dark:focus:ring-white/20',
              )}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {PLACEHOLDERS.map((placeholder) => (
              <button
                key={placeholder}
                type="button"
                onClick={() => setDraft({ ...draft, message: `${draft.message}{${placeholder}}` })}
                className="rounded-full bg-black/[0.05] px-2 py-0.5 font-mono text-[0.625rem] text-zinc-600 hover:bg-black/[0.1] dark:bg-white/[0.07] dark:text-zinc-300"
              >
                {`{${placeholder}}`}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Input
              label={t('danger.confirmLabel')}
              value={draft.confirmLabel}
              onChange={(event) => setDraft({ ...draft, confirmLabel: event.target.value })}
            />
            <Input
              label={t('danger.cancelLabel')}
              value={draft.cancelLabel}
              onChange={(event) => setDraft({ ...draft, cancelLabel: event.target.value })}
            />
            {draft.level === 'critical' && (
              <Input
                label={t('danger.wordLabel')}
                value={draft.confirmWord}
                onChange={(event) => setDraft({ ...draft, confirmWord: event.target.value })}
                className="font-mono uppercase"
              />
            )}
          </div>

          {/* Anteprima con valori d'esempio: nessun dato reale dell'utente. */}
          {preview && (
            <div className="flex flex-col gap-1 rounded-2xl bg-red-500/10 p-4">
              <span className="text-[0.625rem] tracking-wide text-red-500 uppercase">
                {t('danger.preview')}
              </span>
              <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {preview.title}
              </span>
              <span className="text-xs text-zinc-600 dark:text-zinc-300">{preview.message}</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDraft(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="accent" onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </div>
        </GlassPanel>
      )}
    </div>
  );
}
