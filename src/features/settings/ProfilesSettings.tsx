import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { NodeIcon } from '@/components/NodeIcon';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { ColorField, Switch } from '@/components/ui/fields';
import { api } from '@/lib/ipc';
import { invalidateEverything, keys } from '@/lib/queries';
import { paths } from '@/lib/routes';
import { useActiveProfile, useSession } from '@/stores/session';
import { toast, toastError } from '@/stores/toasts';
import type { Profile } from '@/types/generated/Profile';
import type { WorkspaceEntry } from '@/types/generated/WorkspaceEntry';
import { InlineField } from '../inspector/fields';
import { Group } from './parts';

/**
 * Profili (D1): lenti sulla stessa libreria. Qui si rinominano, si colorano,
 * si eliminano, e si sceglie quali workspace vede il profilo attivo.
 */
export function ProfilesSettings() {
  const { t } = useTranslation();
  const profiles = useSession((state) => state.profiles);
  const active = useActiveProfile();
  const refreshProfiles = useSession((state) => state.refreshProfiles);
  const [removing, setRemoving] = useState<Profile | null>(null);

  const save = async (id: string, patch: Parameters<typeof api.updateProfile>[1]) => {
    await api.updateProfile(id, patch);
    await refreshProfiles();
  };

  return (
    <Group title={t('profiles.title')}>
      {profiles.map((profile) => (
        <div key={profile.id} className="flex flex-wrap items-end gap-4 px-4 py-3">
          <div className="min-w-48 flex-1">
            <InlineField
              label={profile.id === active?.id ? t('profiles.nameActive') : t('profiles.name')}
              value={profile.name}
              required
              onCommit={(name) => save(profile.id, { name })}
            />
          </div>
          <div className="min-w-0">
            <ColorField
              label={t('create.color')}
              value={profile.colorMain}
              onChange={(colorMain) =>
                void save(profile.id, { colorMain }).catch((error) =>
                  toastError(t('settings.saveFailed'), error),
                )
              }
              presetLabel={(key) => t(`colors.${key}`)}
            />
          </div>
          {profiles.length > 1 && (
            <Button
              variant="ghost"
              className="text-danger hover:bg-danger-soft hover:text-danger"
              onClick={() => setRemoving(profile)}
            >
              <Trash2 />
              {t('profiles.delete')}
            </Button>
          )}
        </div>
      ))}
      {active && <VisibleWorkspaces profile={active} />}
      {removing && <DeleteProfileDialog profile={removing} onClose={() => setRemoving(null)} />}
    </Group>
  );
}

/** Tutti i workspace della libreria (quelli di ogni profilo) con un interruttore. */
function VisibleWorkspaces({ profile }: { profile: Profile }) {
  const { t } = useTranslation();
  const profiles = useSession((state) => state.profiles);
  const lists = useQueries({
    queries: profiles.map((other) => ({
      queryKey: keys.workspaces(other.id),
      queryFn: () => api.listWorkspaces(other.id),
    })),
  });

  const all = new Map<string, WorkspaceEntry>();
  lists.forEach((list) => list.data?.forEach((entry) => all.set(entry.node.id, entry)));
  const mine = new Set(
    lists[profiles.findIndex((other) => other.id === profile.id)]?.data?.map(
      (entry) => entry.node.id,
    ) ?? [],
  );

  const toggle = async (workspaceId: string, visible: boolean) => {
    try {
      await api.setWorkspaceVisibility(profile.id, workspaceId, visible);
      await invalidateEverything();
    } catch (error) {
      toastError(t('settings.saveFailed'), error);
    }
  };

  return (
    <div className="px-4 py-3">
      <p className="text-ink-2 text-xs font-semibold">
        {t('profiles.workspacesOf', { name: profile.name })}
      </p>
      <p className="text-ink-3 mb-2 text-xs">{t('profiles.workspacesHint')}</p>
      <ul className="flex flex-col">
        {[...all.values()]
          .sort((a, b) => a.node.name.localeCompare(b.node.name))
          .map((entry) => {
            const visible = mine.has(entry.node.id);
            return (
              <li key={entry.node.id} className="flex min-h-10 items-center gap-3">
                <NodeIcon
                  kind="workspace"
                  name={entry.node.name}
                  icon={entry.node.icon}
                  color={entry.node.colorMain}
                  size="sm"
                />
                <span className="text-ink min-w-0 flex-1 truncate text-sm">{entry.node.name}</span>
                <Switch
                  checked={visible}
                  // L'ultimo workspace visibile non si nasconde: il profilo resterebbe vuoto.
                  disabled={visible && mine.size === 1}
                  onCheckedChange={(on) => void toggle(entry.node.id, on)}
                />
              </li>
            );
          })}
      </ul>
    </div>
  );
}

function DeleteProfileDialog({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const impact = useQuery({
    queryKey: ['profile-impact', profile.id],
    queryFn: () => api.profileDeleteImpact(profile.id),
    gcTime: 0,
  });

  const confirm = async () => {
    setBusy(true);
    try {
      const session = await api.deleteProfile(profile.id);
      const store = useSession.getState();
      await store.activateProfile(session.profile.id);
      await store.refreshProfiles();
      await invalidateEverything();
      onClose();
      navigate(paths.root);
      toast({ title: t('profiles.deleted', { name: profile.name }) });
    } catch (error) {
      setBusy(false);
      toastError(t('profiles.deleteFailed'), error);
    }
  };

  const names = (impact.data?.workspacesDeleted ?? []).map((crumb) => crumb.name).join(', ');

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={t('profiles.deleteTitle', { name: profile.name })}
      description={
        impact.data
          ? names
            ? t('profiles.deleteWith', { names, count: impact.data.nodesDeleted })
            : t('profiles.deleteNothing')
          : t('common.loading')
      }
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" disabled={busy || !impact.data} onClick={() => void confirm()}>
            {t('profiles.delete')}
          </Button>
        </>
      }
    >
      {impact.data && impact.data.workspacesKept > 0 && (
        <p className="bg-hover text-ink-2 mb-1 rounded-md px-3 py-2 text-sm">
          {t('profiles.deleteKept', { count: impact.data.workspacesKept })}
        </p>
      )}
    </Dialog>
  );
}
