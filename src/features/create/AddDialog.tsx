import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, File, Folder, Layers, Link2 } from 'lucide-react';
import { createElement } from 'react';
import { NodeIcon } from '@/components/NodeIcon';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { inputClass, Segmented, Switch, TextField } from '@/components/ui/fields';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import { api } from '@/lib/ipc';
import { canPickPaths, pickPaths } from '@/lib/pickers';
import { invalidateLibrary, useNodeView, usePathInfos } from '@/lib/queries';
import { displayUrl, parseAddInput, type AddIntent } from '@/lib/resources';
import { useDialogs, type AddRequest } from '@/stores/dialogs';
import { useProfileId } from '@/stores/session';
import { toast } from '@/stores/toasts';
import { fileGlyph } from '../resources/glyphs';

/**
 * Un solo ingresso per aggiungere (docs/REDESIGN.md § 7): si incolla o si
 * scrive, e LlamaDesk riconosce se e' un link, un gruppo di link, uno o piu'
 * percorsi locali, oppure il nome di una sezione o di un sottoprogetto.
 */
export function AddDialog({ request }: { request: AddRequest }) {
  const { t } = useTranslation();
  const close = useDialogs((state) => state.close);
  const profileId = useProfileId();

  const [text, setText] = useState(request.initialText ?? '');
  const [destinationId, setDestinationId] = useState(request.parentId);
  const [linkName, setLinkName] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [separate, setSeparate] = useState(false);
  const [containerKind, setContainerKind] = useState<'section' | 'subproject'>('section');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const intent = useMemo(() => parseAddInput(text), [text]);
  const scope = useNodeView(request.parentId, request.workspaceId);
  const destinations = useMemo(() => {
    if (!scope.data) return [];
    return [
      scope.data.node,
      ...scope.data.children
        .filter((entry) => entry.node.kind === 'section')
        .map((entry) => entry.node),
    ];
  }, [scope.data]);
  const destination = destinations.find((node) => node.id === destinationId) ?? scope.data?.node;
  const canHoldSubproject = destination?.kind === 'project';

  const submit = async () => {
    setError(null);
    if (!destination) return;
    setPending(true);
    try {
      const count = await create(intent, destination.id);
      await invalidateLibrary();
      close();
      toast({ title: t('add.done', { count }) });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setPending(false);
    }
  };

  const create = async (current: AddIntent, parentId: string): Promise<number> => {
    switch (current.kind) {
      case 'empty':
        throw new Error(t('add.nothing'));
      case 'link':
        await api.createNode(profileId, parentId, {
          kind: 'link',
          name: linkName ?? current.name,
          url: current.url,
        });
        return 1;
      case 'link_group':
        if (separate) {
          for (const link of current.links) {
            await api.createNode(profileId, parentId, { kind: 'link', ...link });
          }
          return current.links.length;
        }
        if (!groupName.trim()) throw new Error(t('add.groupNameRequired'));
        await api.createLinkGroup(
          profileId,
          parentId,
          groupName,
          current.links.map((link) => ({ kind: 'link', ...link })),
        );
        return 1;
      case 'path':
        for (const entry of current.paths) {
          await api.createNode(profileId, parentId, {
            kind: 'path',
            name: entry.name,
            path: entry.path,
          });
        }
        return current.paths.length;
      case 'name':
        await api.createNode(profileId, parentId, {
          kind: canHoldSubproject ? containerKind : 'section',
          name: current.name,
        });
        return 1;
    }
  };

  const browse = async (directory: boolean) => {
    const picked = await pickPaths({ directory, multiple: true });
    if (picked.length === 0) return;
    const existing = intent.kind === 'path' ? `${text.trim()}\n` : '';
    setText(existing + picked.join('\n'));
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={t('add.title')}
      closeLabel={t('common.close')}
      className="w-[min(560px,calc(100vw-32px))]"
      footer={
        <>
          {canPickPaths() && (
            <div className="mr-auto flex gap-1">
              <Button variant="ghost" onClick={() => void browse(false)}>
                <File />
                {t('add.browseFile')}
              </Button>
              <Button variant="ghost" onClick={() => void browse(true)}>
                <Folder />
                {t('add.browseFolder')}
              </Button>
            </div>
          )}
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void submit()}
            disabled={pending || intent.kind === 'empty'}
          >
            {submitLabel(intent, separate, canHoldSubproject ? containerKind : 'section', t)}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="add-input" className="text-ink-2 text-xs font-semibold">
            {t('add.inputLabel')}
          </label>
          <textarea
            id="add-input"
            autoFocus
            rows={3}
            value={text}
            placeholder={t('add.placeholder')}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
              setLinkName(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            className={cn(inputClass, 'h-auto resize-none py-2 font-mono text-xs leading-5')}
          />
          <p className="text-ink-3 text-xs">{t('add.inputHint')}</p>
        </div>

        {destinations.length > 1 && destination && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-ink-3">{t('add.destination')}</span>
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className="bg-hover text-ink hover:bg-press flex h-7 items-center gap-1.5 rounded-sm px-2 font-medium"
                >
                  <NodeIcon
                    kind={destination.kind}
                    name={destination.name}
                    icon={destination.icon}
                    color={destination.colorMain}
                    size="xs"
                  />
                  {destination.name}
                  <ChevronDown className="text-ink-3 size-3.5" />
                </button>
              </MenuTrigger>
              <MenuContent>
                {destinations.map((node) => (
                  <MenuItem
                    key={node.id}
                    selected={node.id === destination.id}
                    icon={
                      <NodeIcon
                        kind={node.kind}
                        name={node.name}
                        icon={node.icon}
                        color={node.colorMain}
                        size="sm"
                      />
                    }
                    onSelect={() => setDestinationId(node.id)}
                  >
                    {node.name}
                  </MenuItem>
                ))}
              </MenuContent>
            </Menu>
          </div>
        )}

        <Preview
          intent={intent}
          linkName={linkName}
          onLinkName={setLinkName}
          groupName={groupName}
          onGroupName={setGroupName}
          separate={separate}
          onSeparate={setSeparate}
          containerKind={containerKind}
          onContainerKind={setContainerKind}
          canHoldSubproject={canHoldSubproject}
        />

        {error && (
          <p role="alert" className="text-danger text-sm">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function submitLabel(
  intent: AddIntent,
  separate: boolean,
  containerKind: 'section' | 'subproject',
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  switch (intent.kind) {
    case 'link':
      return t('add.submitLink');
    case 'link_group':
      return separate
        ? t('add.submitLinks', { count: intent.links.length })
        : t('add.submitGroup', { count: intent.links.length });
    case 'path':
      return t('add.submitPaths', { count: intent.paths.length });
    case 'name':
      return t(`create.title.${containerKind}`);
    default:
      return t('add.submit');
  }
}

interface PreviewProps {
  intent: AddIntent;
  linkName: string | null;
  onLinkName: (name: string) => void;
  groupName: string;
  onGroupName: (name: string) => void;
  separate: boolean;
  onSeparate: (value: boolean) => void;
  containerKind: 'section' | 'subproject';
  onContainerKind: (kind: 'section' | 'subproject') => void;
  canHoldSubproject: boolean;
}

/** Che cosa verra' creato, prima di crearlo. */
function Preview(props: PreviewProps) {
  const { t } = useTranslation();
  const { intent } = props;
  const pathInfos = usePathInfos(
    intent.kind === 'path' ? intent.paths.map((entry) => entry.path) : [],
  );
  const box = 'rounded-lg bg-sunken/60 p-3 shadow-[inset_0_0_0_1px_var(--ld-line)]';

  switch (intent.kind) {
    case 'empty':
      return null;

    case 'link':
      return (
        <div className={cn(box, 'flex flex-col gap-3')}>
          <Detected icon={<Link2 />} label={t('kinds.one.link')} detail={displayUrl(intent.url)} />
          <TextField
            label={t('create.name')}
            value={props.linkName ?? intent.name}
            onChange={(event) => props.onLinkName(event.target.value)}
          />
        </div>
      );

    case 'link_group':
      return (
        <div className={cn(box, 'flex flex-col gap-3')}>
          <Detected
            icon={<Layers />}
            label={t('add.detectedGroup', { count: intent.links.length })}
            detail={t('add.groupExplain')}
          />
          <ul className="flex max-h-32 flex-col gap-1 overflow-y-auto">
            {intent.links.map((link) => (
              <li key={link.url} className="flex min-w-0 gap-2 text-xs">
                <span className="text-ink-2 shrink-0 font-semibold">{link.name}</span>
                <span className="text-ink-3 truncate font-mono">{displayUrl(link.url)}</span>
              </li>
            ))}
          </ul>
          {!props.separate && (
            <TextField
              label={t('add.groupName')}
              placeholder="SpecialHub DEV"
              value={props.groupName}
              onChange={(event) => props.onGroupName(event.target.value)}
            />
          )}
          <label className="text-ink-2 flex items-center gap-2 text-sm">
            <Switch checked={props.separate} onCheckedChange={props.onSeparate} />
            {t('add.separate')}
          </label>
        </div>
      );

    case 'path':
      return (
        <ul className={cn(box, 'flex max-h-44 flex-col gap-2 overflow-y-auto')}>
          {intent.paths.map((entry) => {
            const info = pathInfos.data?.get(entry.path);
            return (
              <li key={entry.path} className="flex min-w-0 items-center gap-2.5">
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-4',
                    info?.kind === 'missing' || info?.kind === 'unavailable'
                      ? 'bg-caution-soft text-caution'
                      : 'bg-hover text-ink-2',
                  )}
                >
                  {createElement(fileGlyph(info))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-sm font-semibold">
                    {entry.name}
                  </span>
                  <span className="text-2xs text-ink-3 block truncate font-mono">{entry.path}</span>
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs',
                    info?.kind === 'missing' || info?.kind === 'unavailable'
                      ? 'text-caution'
                      : 'text-ink-3',
                  )}
                >
                  {info ? t(`resources.pathKind.${info.kind}`) : t('common.loading')}
                </span>
              </li>
            );
          })}
        </ul>
      );

    case 'name':
      return (
        <div className={cn(box, 'flex items-center gap-3')}>
          <span className="text-ink-2 flex-1 text-sm">{t('add.detectedName')}</span>
          {props.canHoldSubproject && (
            <Segmented
              label={t('add.containerKind')}
              value={props.containerKind}
              onChange={props.onContainerKind}
              options={[
                { value: 'section', label: t('kinds.one.section') },
                { value: 'subproject', label: t('kinds.one.subproject') },
              ]}
            />
          )}
        </div>
      );
  }
}

function Detected({
  icon,
  label,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  detail: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="bg-accent-soft text-accent flex size-7 shrink-0 items-center justify-center rounded-md [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="text-ink block text-sm font-semibold">{label}</span>
        <span className="text-ink-3 block truncate text-xs">{detail}</span>
      </span>
    </div>
  );
}
