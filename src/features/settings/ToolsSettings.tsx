import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Segmented, Switch, TextField } from '@/components/ui/fields';
import { Tip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { api } from '@/lib/ipc';
import { canPickPaths, pickPaths } from '@/lib/pickers';
import { invalidateTools, useSetToolPreference, useToolPreferences, useTools } from '@/lib/queries';
import { toast, toastError } from '@/stores/toasts';
import type { Tool } from '@/types/generated/Tool';
import type { ToolKind } from '@/types/generated/ToolKind';
import { ToolPreferenceField } from '../inspector/ToolSections';
import { Group } from './parts';

const KINDS: readonly ToolKind[] = ['ide', 'terminal', 'browser'];

/**
 * Strumenti: quelli trovati sul PC, quelli aggiunti a mano, e quale usare
 * quando un progetto non ne sceglie uno. Il rilevamento legge solo il disco.
 */
export function ToolsSettings() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const tools = useTools(true);
  const preferences = useToolPreferences(null, null);
  const setPreference = useSetToolPreference();
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const found = await api.refreshTools();
      await invalidateTools(client);
      toast({
        title: t('tools.refreshed', { count: found.filter((tool) => tool.available).length }),
      });
    } catch (error) {
      toastError(t('tools.refreshFailed'), error);
    } finally {
      setRefreshing(false);
    }
  };

  const all = tools.data ?? [];

  return (
    <Group title={t('tools.title')}>
      <div className="flex flex-col gap-3 px-4 py-3">
        <p className="text-ink-3 text-xs">{t('tools.defaultsHint')}</p>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {KINDS.map((kind) => {
            const state = preferences.data?.find((entry) => entry.kind === kind);
            const choices = all.filter(
              (tool) => tool.kind === kind && tool.available && !tool.isHidden,
            );
            const automatic = choices.find((tool) => tool.id === state?.effective)?.name;
            return (
              <ToolPreferenceField
                key={kind}
                kind={kind}
                tools={choices}
                own={state?.own ?? null}
                effective={state?.effective ?? null}
                inheritLabel={
                  kind === 'browser'
                    ? t('tools.systemBrowser')
                    : automatic
                      ? t('tools.automatic', { tool: automatic })
                      : undefined
                }
                onChange={(toolId) =>
                  setPreference.mutate(
                    { nodeId: null, kind, toolId },
                    { onError: (error) => toastError(t('settings.saveFailed'), error) },
                  )
                }
              />
            );
          })}
        </div>
      </div>

      {KINDS.map((kind) => {
        const ofKind = all.filter((tool) => tool.kind === kind);
        if (ofKind.length === 0) return null;
        return (
          <div key={kind} className="px-4 py-3">
            <h3 className="text-ink-2 mb-1.5 text-xs font-semibold">
              {t(`tools.kindPlural.${kind}`)}
            </h3>
            <ul className="flex flex-col">
              {ofKind.map((tool) => (
                <ToolRow key={tool.id} tool={tool} />
              ))}
            </ul>
          </div>
        );
      })}

      {adding && <AddToolForm onDone={() => setAdding(false)} />}

      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        <Button onClick={() => void refresh()} disabled={refreshing}>
          <RefreshCw className={cn(refreshing && 'animate-spin')} />
          {t('tools.refresh')}
        </Button>
        {!adding && (
          <Button variant="ghost" onClick={() => setAdding(true)}>
            <Plus />
            {t('tools.add')}
          </Button>
        )}
      </div>
    </Group>
  );
}

function ToolRow({ tool }: { tool: Tool }) {
  const { t } = useTranslation();
  const client = useQueryClient();

  const change = async (run: () => Promise<unknown>) => {
    try {
      await run();
      await invalidateTools(client);
    } catch (error) {
      toastError(t('settings.saveFailed'), error);
    }
  };

  return (
    <li className="flex min-h-10 items-center gap-3 py-1">
      <span className={cn('min-w-0 flex-1', tool.isHidden && 'opacity-50')}>
        <span className="text-ink flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{tool.name}</span>
          {tool.source === 'custom' && (
            <span className="bg-hover text-2xs text-ink-2 rounded-xs px-1.5">
              {t('tools.custom')}
            </span>
          )}
          {!tool.available && (
            <span className="bg-caution-soft text-2xs text-caution rounded-xs px-1.5">
              {t('tools.missing')}
            </span>
          )}
        </span>
        <span
          className="selectable text-2xs text-ink-3 block truncate font-mono"
          title={tool.exePath}
        >
          {tool.exePath}
        </span>
      </span>
      {tool.source === 'custom' ? (
        <Tip label={t('tools.delete', { name: tool.name })}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t('tools.delete', { name: tool.name })}
            onClick={() => void change(() => api.deleteCustomTool(tool.id))}
          >
            <Trash2 />
          </Button>
        </Tip>
      ) : (
        <Tip label={tool.isHidden ? t('tools.show') : t('tools.hide')}>
          <span>
            <Switch
              checked={!tool.isHidden}
              onCheckedChange={(visible) => void change(() => api.setToolHidden(tool.id, !visible))}
            />
          </span>
        </Tip>
      )}
    </li>
  );
}

function AddToolForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [kind, setKind] = useState<ToolKind>('ide');
  const [name, setName] = useState('');
  const [exePath, setExePath] = useState('');
  const [args, setArgs] = useState('');
  const [error, setError] = useState<string | null>(null);

  const browse = async () => {
    const [path] = await pickPaths({ directory: false, multiple: false });
    if (!path) return;
    setExePath(path);
    if (!name.trim()) {
      setName(
        path
          .split(/[\\/]/)
          .pop()
          ?.replace(/\.(exe|cmd|bat)$/i, '') ?? '',
      );
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const tool = await api.addCustomTool(kind, name, exePath, args);
      await invalidateTools(client);
      toast({ title: t('tools.added', { name: tool.name }) });
      onDone();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 px-4 py-4">
      <Segmented
        label={t('tools.kindLabel')}
        value={kind}
        onChange={setKind}
        options={KINDS.map((value) => ({ value, label: t(`tools.kind.${value}`) }))}
      />
      <TextField
        label={t('create.name')}
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="flex items-end gap-2">
        <TextField
          className="min-w-0 flex-1"
          label={t('tools.exe')}
          value={exePath}
          placeholder={String.raw`C:\Program Files\...\app.exe`}
          onChange={(event) => {
            setExePath(event.target.value);
            setError(null);
          }}
        />
        {canPickPaths() && (
          <Button type="button" onClick={() => void browse()}>
            {t('add.browse')}
          </Button>
        )}
      </div>
      <TextField
        label={t('tools.args')}
        value={args}
        placeholder={kind === 'browser' ? '{urls}' : '{path}'}
        hint={t('tools.argsHint')}
        error={error}
        onChange={(event) => setArgs(event.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" variant="primary" disabled={!name.trim() || !exePath.trim()}>
          {t('tools.addSubmit')}
        </Button>
      </div>
    </form>
  );
}
