import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, Switch } from '@/components/ui/fields';
import {
  useBrowserProfiles,
  useSetToolPreference,
  useToolPreferences,
  useTools,
} from '@/lib/queries';
import { toastError } from '@/stores/toasts';
import type { NodePatch } from '@/types/generated/NodePatch';
import type { NodeView } from '@/types/generated/NodeView';
import type { ToolKind } from '@/types/generated/ToolKind';
import { PanelSection } from './fields';

const DEFAULT = '';

/**
 * Come si aprono un link o un gruppo: browser, profilo del browser, nuova
 * finestra. Senza browser scelto si usa quello predefinito di Windows; profilo
 * e nuova finestra richiedono un browser preciso, e in quel caso vale il
 * browser preferito.
 */
export function OpeningSection({
  view,
  onSave,
}: {
  view: NodeView;
  onSave: (patch: NodePatch) => Promise<void>;
}) {
  const { t } = useTranslation();
  const browserId = useId();
  const profileId = useId();
  const windowId = useId();
  const tools = useTools();
  const { node } = view;
  const browsers = (tools.data ?? []).filter((tool) => tool.kind === 'browser' && tool.available);
  const profiles = useBrowserProfiles(node.browserToolId);

  const save = (patch: NodePatch) =>
    void onSave(patch).catch((error) => toastError(t('settings.saveFailed'), error));

  return (
    <PanelSection title={t('inspector.opening')}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={browserId} className="text-ink-2 text-xs font-semibold">
          {t('inspector.browser')}
        </label>
        <Select
          id={browserId}
          value={node.browserToolId ?? DEFAULT}
          onValueChange={(value) => save({ browserToolId: value || null, browserProfile: null })}
          options={[
            { value: DEFAULT, label: t('inspector.browserDefault') },
            ...browsers.map((tool) => ({ value: tool.id, label: tool.name })),
          ]}
        />
      </div>

      {node.browserToolId && (profiles.data ?? []).length > 0 && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={profileId} className="text-ink-2 text-xs font-semibold">
            {t('inspector.browserProfile')}
          </label>
          <Select
            id={profileId}
            value={node.browserProfile ?? DEFAULT}
            onValueChange={(value) => save({ browserProfile: value || null })}
            options={[
              { value: DEFAULT, label: t('inspector.browserProfileNone') },
              ...(profiles.data ?? []).map((profile) => ({
                value: profile.id,
                label: profile.name,
              })),
            ]}
          />
        </div>
      )}

      <div className="flex items-center gap-3">
        <label htmlFor={windowId} className="text-ink min-w-0 flex-1 text-sm">
          {t('inspector.newWindow')}
        </label>
        <Switch
          id={windowId}
          checked={node.openMode === 'new_window'}
          onCheckedChange={(checked) => save({ openMode: checked ? 'new_window' : null })}
        />
      </div>
      {!node.browserToolId && node.openMode === 'new_window' && (
        <p className="text-ink-3 text-xs">{t('inspector.newWindowHint')}</p>
      )}
    </PanelSection>
  );
}

/** Strumenti preferiti per un contenitore o un percorso, ereditati verso il basso. */
export function ToolPreferencesSection({
  view,
  workspaceId,
  kinds,
}: {
  view: NodeView;
  workspaceId: string;
  kinds: readonly ToolKind[];
}) {
  const { t } = useTranslation();
  const tools = useTools();
  const preferences = useToolPreferences(view.node.id, workspaceId);
  const setPreference = useSetToolPreference();

  return (
    <PanelSection title={t('inspector.tools')}>
      <p className="text-ink-3 text-xs">{t('inspector.toolsHint')}</p>
      {kinds.map((kind) => (
        <ToolPreferenceField
          key={kind}
          kind={kind}
          tools={(tools.data ?? []).filter((tool) => tool.kind === kind && tool.available)}
          own={preferences.data?.find((state) => state.kind === kind)?.own ?? null}
          effective={preferences.data?.find((state) => state.kind === kind)?.effective ?? null}
          onChange={(toolId) =>
            setPreference.mutate(
              { nodeId: view.node.id, kind, toolId },
              { onError: (error) => toastError(t('settings.saveFailed'), error) },
            )
          }
        />
      ))}
    </PanelSection>
  );
}

export function ToolPreferenceField({
  kind,
  tools,
  own,
  effective,
  onChange,
  inheritLabel,
}: {
  kind: ToolKind;
  tools: { id: string; name: string }[];
  own: string | null;
  effective: string | null;
  onChange: (toolId: string | null) => void;
  /** Etichetta della voce "nessuna scelta" (default: "Eredita · …"). */
  inheritLabel?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  const effectiveName = tools.find((tool) => tool.id === effective)?.name;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink-2 text-xs font-semibold">
        {t(`tools.kind.${kind}`)}
      </label>
      <Select
        id={id}
        value={own ?? DEFAULT}
        disabled={tools.length === 0}
        onValueChange={(value) => onChange(value || null)}
        options={[
          {
            value: DEFAULT,
            label:
              tools.length === 0
                ? t('tools.noneFound')
                : (inheritLabel ??
                  (effectiveName
                    ? t('inspector.toolInherit', { tool: effectiveName })
                    : t('inspector.cautionLevel.inherit'))),
          },
          ...tools.map((tool) => ({ value: tool.id, label: tool.name })),
        ]}
      />
    </div>
  );
}
