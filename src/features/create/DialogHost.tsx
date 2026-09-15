import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ColorField, TextField } from '@/components/ui/fields';
import { api } from '@/lib/ipc';
import { suggestColor } from '@/lib/identity';
import { invalidateLibrary, useCreateNode, useWorkspaces } from '@/lib/queries';
import { paths, routeForChain } from '@/lib/routes';
import { useDialogs, type CreateRequest, type DeleteRequest } from '@/stores/dialogs';
import { useProfileId, useSession } from '@/stores/session';
import { toast, toastError } from '@/stores/toasts';
import { AddDialog } from './AddDialog';

/** I dialoghi condivisi della shell. */
export function DialogHost() {
  const create = useDialogs((state) => state.create);
  const add = useDialogs((state) => state.add);
  const remove = useDialogs((state) => state.remove);
  const newProfile = useDialogs((state) => state.newProfile);

  return (
    <>
      {create && <CreateNodeDialog key={`${create.kind}-${create.parentId}`} request={create} />}
      {add && <AddDialog key={add.parentId} request={add} />}
      {remove && <DeleteNodeDialog key={remove.id} request={remove} />}
      {newProfile && <NewProfileDialog />}
    </>
  );
}

/** Solo workspace e progetti hanno un colore da scegliere alla creazione. */
const COLORED = new Set(['workspace', 'project']);

function CreateNodeDialog({ request }: { request: CreateRequest }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const close = useDialogs((state) => state.close);
  const profileId = useProfileId();
  const workspaces = useWorkspaces();
  const createNode = useCreateNode();

  const [name, setName] = useState('');
  const [color, setColor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const colored = COLORED.has(request.kind);
  const suggested =
    request.kind === 'workspace'
      ? suggestColor((workspaces.data ?? []).map((entry) => entry.node.colorMain))
      : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError(t('create.nameRequired'));
      return;
    }
    try {
      const node = await createNode.mutateAsync({
        parentId: request.parentId,
        input: {
          kind: request.kind,
          name,
          ...(colored && (color ?? suggested)
            ? { colorMain: color ?? suggested ?? undefined }
            : {}),
        },
      });
      close();
      toast({ title: t('create.created', { name: node.name }) });

      if (node.kind === 'workspace') {
        navigate(paths.workspace(node.id));
      } else if (request.workspaceId && ['project', 'subproject', 'section'].includes(node.kind)) {
        const view = await api.nodeView(profileId, node.id, request.workspaceId);
        navigate(routeForChain(request.workspaceId, view.breadcrumb));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={t(`create.title.${request.kind}`)}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="create-node"
            disabled={createNode.isPending}
          >
            {t('create.submit')}
          </Button>
        </>
      }
    >
      <form
        id="create-node"
        onSubmit={(event) => void submit(event)}
        className="flex flex-col gap-4"
      >
        <TextField
          label={t('create.name')}
          placeholder={t(`create.placeholder.${request.kind}`)}
          value={name}
          autoFocus
          error={error}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
        {colored && (
          <ColorField
            label={t('create.color')}
            value={color ?? suggested}
            onChange={setColor}
            presetLabel={(key) => t(`colors.${key}`)}
          />
        )}
      </form>
    </Dialog>
  );
}

function DeleteNodeDialog({ request }: { request: DeleteRequest }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const close = useDialogs((state) => state.close);
  const [pending, setPending] = useState(false);

  const impact = useQuery({
    queryKey: ['delete-impact', request.id],
    queryFn: () => api.deleteImpact(request.id),
    gcTime: 0,
  });

  const summary = (impact.data?.deleted ?? [])
    .map((entry) => t(`kinds.count.${entry.kind}`, { count: entry.count }))
    .join(', ');

  const confirm = async () => {
    setPending(true);
    try {
      const deletionId = await api.deleteNode(request.id);
      await invalidateLibrary();
      close();
      if (pathname.includes(request.id)) navigate(request.fallbackRoute, { replace: true });
      toast({
        title: t('delete.done', { name: request.name }),
        action: {
          label: t('common.undo'),
          run: () =>
            void api
              .restoreDeletion(deletionId)
              .then(() => invalidateLibrary())
              .catch((failure) => toastError(t('delete.restoreFailed'), failure)),
        },
      });
    } catch (failure) {
      setPending(false);
      toastError(t('delete.failed'), failure);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={t('delete.title', { name: request.name })}
      description={impact.data ? t('delete.summary', { summary }) : t('common.loading')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => void confirm()}
            disabled={pending || !impact.data}
          >
            {t('delete.confirm')}
          </Button>
        </>
      }
    >
      {impact.data && impact.data.detached.length > 0 && (
        <p className="bg-hover text-ink-2 rounded-md px-3 py-2 text-sm">
          {t('delete.detached', {
            names: impact.data.detached.map((crumb) => crumb.name).join(', '),
          })}
        </p>
      )}
      {impact.isError && <p className="text-danger text-sm">{String(impact.error)}</p>}
    </Dialog>
  );
}

function NewProfileDialog() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const close = useDialogs((state) => state.close);
  const createProfile = useSession((state) => state.createProfile);
  const activateProfile = useSession((state) => state.activateProfile);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      const profile = await createProfile(name);
      await activateProfile(profile.id);
      await invalidateLibrary();
      close();
      // Un profilo nuovo non vede ancora nessun workspace: si riparte dall'inizio.
      navigate(paths.root);
      toast({ title: t('profiles.created', { name: profile.name }) });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && close()}
      title={t('profiles.newTitle')}
      description={t('profiles.newDescription')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" form="new-profile">
            {t('create.submit')}
          </Button>
        </>
      }
    >
      <form id="new-profile" onSubmit={(event) => void submit(event)}>
        <TextField
          label={t('create.name')}
          placeholder={t('profiles.placeholder')}
          value={name}
          autoFocus
          error={error}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </form>
    </Dialog>
  );
}
