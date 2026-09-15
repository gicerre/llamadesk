import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Blocks, Box, Ellipsis, Hash, House, Trash2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@/components/ui/Menu';
import { Tip } from '@/components/ui/Tooltip';
import { api } from '@/lib/ipc';
import { invalidateLibrary, useSetDefaultWorkspace, useWorkspaces } from '@/lib/queries';
import { paths, routeForChain } from '@/lib/routes';
import { useDialogs } from '@/stores/dialogs';
import { toast, toastError } from '@/stores/toasts';
import type { NodeKind } from '@/types/generated/NodeKind';
import type { NodeView } from '@/types/generated/NodeView';

/** Che cosa si puo' creare dentro ogni contenitore, in questa fase. */
const CREATABLE: Partial<Record<NodeKind, NodeKind[]>> = {
  workspace: ['project', 'section'],
  project: ['subproject', 'section'],
  subproject: ['section'],
  section: ['section'],
};

const CREATE_ICON: Partial<Record<NodeKind, React.ReactNode>> = {
  project: <Box />,
  subproject: <Blocks />,
  section: <Hash />,
};

/**
 * Menu "Altro" dell'intestazione. Azioni poche e raggruppate; l'eliminazione
 * sta in fondo, separata. Il menu contestuale completo arriva con la fase 4.
 */
export function NodeMenu({ view, workspaceId }: { view: NodeView; workspaceId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const openCreate = useDialogs((state) => state.openCreate);
  const openDelete = useDialogs((state) => state.openDelete);
  const workspaces = useWorkspaces();
  const setDefault = useSetDefaultWorkspace();
  const { node, breadcrumb } = view;

  const isDefault =
    node.kind === 'workspace' &&
    workspaces.data?.find((entry) => entry.node.id === node.id)?.isDefault;
  const workspace = view.workspaces.find((crumb) => crumb.id === workspaceId);
  // Un progetto condiviso: togliere l'appartenenza e' diverso da eliminarlo.
  const shared = node.kind === 'project' && view.workspaces.length > 1;

  const unshare = async () => {
    try {
      await api.unshareNode(node.id, workspaceId);
      await invalidateLibrary();
      navigate(paths.workspace(workspaceId), { replace: true });
      toast({
        title: t('actions.unshared', { name: node.name, workspace: workspace?.name ?? '' }),
      });
    } catch (error) {
      toastError(t('actions.unshareFailed'), error);
    }
  };

  const parentRoute =
    node.kind === 'workspace' ? paths.root : routeForChain(workspaceId, breadcrumb.slice(0, -1));

  return (
    <Menu>
      <Tip label={t('actions.more')}>
        <MenuTrigger asChild>
          <Button variant="ghost" iconOnly aria-label={t('actions.more')}>
            <Ellipsis />
          </Button>
        </MenuTrigger>
      </Tip>
      <MenuContent align="end">
        {(CREATABLE[node.kind] ?? []).map((kind) => (
          <MenuItem
            key={kind}
            icon={CREATE_ICON[kind]}
            onSelect={() => openCreate({ kind, parentId: node.id, workspaceId })}
          >
            {t(`create.title.${kind}`)}
          </MenuItem>
        ))}
        {node.kind === 'workspace' && !isDefault && (
          <MenuItem
            icon={<House />}
            onSelect={() =>
              setDefault.mutate(node.id, {
                onSuccess: () => toast({ title: t('actions.defaultSet', { name: node.name }) }),
                onError: (error) => toastError(t('actions.defaultFailed'), error),
              })
            }
          >
            {t('actions.setDefault')}
          </MenuItem>
        )}
        <MenuSeparator />
        {shared && (
          <MenuItem icon={<Unlink />} onSelect={() => void unshare()}>
            {t('actions.unshare', { workspace: workspace?.name ?? '' })}
          </MenuItem>
        )}
        <MenuItem
          tone="danger"
          icon={<Trash2 />}
          onSelect={() =>
            openDelete({
              id: node.id,
              name: node.name,
              kind: node.kind,
              fallbackRoute: parentRoute,
            })
          }
        >
          {shared ? t('delete.action.everywhere') : t(`delete.action.${node.kind}`)}
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
