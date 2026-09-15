import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { ContextMenu, DropdownMenu } from 'radix-ui';
import {
  ChevronRight,
  Ellipsis,
  Play,
  SlidersHorizontal,
  Star,
  StarOff,
  Trash2,
} from 'lucide-react';
import { createElement } from 'react';
import { Button } from '@/components/ui/Button';
import { menuItem, menuSurface } from '@/components/ui/Menu';
import { Tip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { api } from '@/lib/ipc';
import {
  invalidateLaunch,
  useFavorites,
  useToggleFavorite,
  useToolPreferences,
  useTools,
} from '@/lib/queries';
import { useDialogs } from '@/stores/dialogs';
import { useInspector } from '@/stores/inspector';
import { toast, toastError } from '@/stores/toasts';
import type { Node } from '@/types/generated/Node';
import type { PathInfo } from '@/types/generated/PathInfo';
import type { Tool } from '@/types/generated/Tool';
import type { ToolKind } from '@/types/generated/ToolKind';
import { actionsFor, type ActionDef } from './registry';
import { useLaunchOwner } from '../launch/context';
import { runAction } from './run';

/* ============================================================================
   Menu delle azioni di una risorsa: lo stesso contenuto per il clic destro e
   per il pulsante "…" della riga. Radix ha due famiglie di componenti con la
   stessa anatomia; `Kit` sceglie quale usare.

   Ordine: azioni (la principale per prima), copia, modifica e preferiti,
   eliminazione in fondo e separata (docs/REDESIGN.md § 8).
   ========================================================================== */

type Kit = typeof DropdownMenu;
const contextKit = ContextMenu as unknown as Kit;

interface ResourceMenuProps {
  node: Node;
  pathInfo?: PathInfo;
  workspaceId: string;
}

/** Clic destro sulla riga. `children` e' la riga stessa. */
export function ResourceContextMenu({
  children,
  ...props
}: ResourceMenuProps & { children: React.ReactElement }) {
  return (
    <ContextMenu.Root modal={false}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content collisionPadding={8} className={menuSurface}>
          <MenuItems kit={contextKit} {...props} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

/**
 * Pulsanti al passaggio del mouse: le azioni "quick" e il menu "…". Il clic
 * non arriva alla riga (che eseguirebbe l'azione principale).
 */
export function ResourceQuickActions(props: ResourceMenuProps) {
  const { t } = useTranslation();
  const quick = actionsFor(props).filter((action) => action.weight === 'quick');
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();

  return (
    <span className="flex items-center gap-0.5" onClick={stop} onKeyDown={stop}>
      {quick.map((action) => (
        <Tip key={`${action.id}-${action.label}`} label={t(`actions.run.${action.label}`)}>
          <Button
            variant="ghost"
            size="sm"
            iconOnly
            aria-label={t(`actions.run.${action.label}`)}
            onClick={() =>
              void runAction({
                node: props.node,
                actionId: action.id,
                workspaceId: props.workspaceId,
              })
            }
          >
            {createElement(action.icon)}
          </Button>
        </Tip>
      ))}
      <DropdownMenu.Root modal={false}>
        <Tip label={t('actions.more')}>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="sm" iconOnly aria-label={t('actions.more')}>
              <Ellipsis />
            </Button>
          </DropdownMenu.Trigger>
        </Tip>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            collisionPadding={8}
            className={menuSurface}
          >
            <MenuItems kit={DropdownMenu} {...props} />
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </span>
  );
}

/** Montato solo a menu aperto: le preferenze si leggono quando servono. */
function MenuItems({ kit: K, node, pathInfo, workspaceId }: ResourceMenuProps & { kit: Kit }) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const openInspector = useInspector((state) => state.open);
  const openDelete = useDialogs((state) => state.openDelete);
  const tools = useTools();
  const preferences = useToolPreferences(node.id, workspaceId);
  const favorites = useFavorites();
  const toggleFavorite = useToggleFavorite();
  const launchOwner = useLaunchOwner();

  const actions = actionsFor({ node, pathInfo });
  const runnable = actions.filter((action) => action.id !== 'copy');
  const copy = actions.find((action) => action.id === 'copy');
  const isFavorite = favorites.data?.some((favorite) => favorite.node.id === node.id) ?? false;

  const available = (kind: ToolKind) =>
    (tools.data ?? []).filter((tool) => tool.kind === kind && tool.available);
  const effective = (kind: ToolKind) => {
    const id = preferences.data?.find((state) => state.kind === kind)?.effective;
    return (tools.data ?? []).find((tool) => tool.id === id);
  };

  const run = (action: ActionDef, tool?: Tool) =>
    void runAction({ node, actionId: action.id, toolId: tool?.id ?? null, workspaceId });

  const item = (action: ActionDef, label: string, tool?: Tool, shortcut?: string) => (
    <K.Item
      key={`${action.id}-${action.label}-${tool?.id ?? ''}`}
      className={menuItem}
      onSelect={() => run(action, tool)}
    >
      {createElement(action.icon)}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {shortcut && <span className="text-2xs text-ink-3">{shortcut}</span>}
    </K.Item>
  );

  const toolSubmenu = (action: ActionDef, label: string, choices: Tool[]) => (
    <K.Sub key={`${action.id}-${action.label}-with`}>
      <K.SubTrigger className={cn(menuItem, 'data-[state=open]:bg-hover')}>
        {createElement(action.icon)}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight className="size-3.5!" aria-hidden />
      </K.SubTrigger>
      <K.Portal>
        <K.SubContent collisionPadding={8} sideOffset={4} className={menuSurface}>
          {choices.map((tool) => (
            <K.Item key={tool.id} className={menuItem} onSelect={() => run(action, tool)}>
              <span className="min-w-0 flex-1 truncate">{tool.name}</span>
            </K.Item>
          ))}
        </K.SubContent>
      </K.Portal>
    </K.Sub>
  );

  return (
    <>
      {runnable.map((action) => {
        const shortcut = action.weight === 'primary' ? t('actions.enter') : undefined;
        if (!action.tool)
          return item(action, t(`actions.run.${action.label}`), undefined, shortcut);

        const choices = available(action.tool);
        if (choices.length === 0) return null;
        // Link e gruppi si aprono gia' nel browser predefinito: qui solo "con…".
        if (action.tool === 'browser') {
          return toolSubmenu(action, t(`actions.run.${action.label}`), choices);
        }
        const chosen = effective(action.tool);
        const others = choices.filter((tool) => tool.id !== chosen?.id);
        return [
          item(
            action,
            chosen
              ? t(`actions.run.${action.label}Tool`, { tool: chosen.name })
              : t(`actions.run.${action.label}`),
            undefined,
            shortcut,
          ),
          others.length > 0 && toolSubmenu(action, t(`actions.with.${action.tool}`), others),
        ];
      })}

      <K.Separator className="bg-line mx-1 my-1 h-px" />
      {launchOwner && runnable.length > 0 && (
        <K.Sub>
          <K.SubTrigger className={cn(menuItem, 'data-[state=open]:bg-hover')}>
            <Play />
            <span className="min-w-0 flex-1 truncate">
              {t('launch.addTo', { name: launchOwner.name })}
            </span>
            <ChevronRight className="size-3.5!" aria-hidden />
          </K.SubTrigger>
          <K.Portal>
            <K.SubContent collisionPadding={8} sideOffset={4} className={menuSurface}>
              {runnable.map((action) => (
                <K.Item
                  key={`${action.id}-${action.label}`}
                  className={menuItem}
                  onSelect={() =>
                    void api
                      .addLaunchStep(launchOwner.id, node.id, action.id)
                      .then(async () => {
                        await invalidateLaunch();
                        toast({ title: t('launch.added', { name: launchOwner.name }) });
                      })
                      .catch((error) => toastError(t('launch.changeFailed'), error))
                  }
                >
                  {createElement(action.icon)}
                  <span className="min-w-0 flex-1 truncate">
                    {t(`actions.run.${action.label}`)}
                  </span>
                </K.Item>
              ))}
            </K.SubContent>
          </K.Portal>
        </K.Sub>
      )}
      {copy && item(copy, t(`actions.run.${copy.label}`))}
      <K.Item className={menuItem} onSelect={() => openInspector(node.id, workspaceId)}>
        <SlidersHorizontal />
        <span className="min-w-0 flex-1 truncate">{t('inspector.open')}</span>
        <span className="text-2xs text-ink-3">{t('actions.space')}</span>
      </K.Item>
      <K.Item
        className={menuItem}
        onSelect={() =>
          toggleFavorite.mutate(node.id, {
            onError: (error) => toastError(t('actions.favoriteFailed'), error),
          })
        }
      >
        {isFavorite ? <StarOff /> : <Star />}
        <span className="min-w-0 flex-1 truncate">
          {isFavorite ? t('actions.unfavorite') : t('actions.favorite')}
        </span>
      </K.Item>
      <K.Separator className="bg-line mx-1 my-1 h-px" />
      <K.Item
        className={cn(menuItem, 'text-danger [&_svg]:text-danger')}
        onSelect={() =>
          openDelete({ id: node.id, name: node.name, kind: node.kind, fallbackRoute: pathname })
        }
      >
        <Trash2 />
        <span className="min-w-0 flex-1 truncate">{t(`delete.action.${node.kind}`)}</span>
      </K.Item>
    </>
  );
}
