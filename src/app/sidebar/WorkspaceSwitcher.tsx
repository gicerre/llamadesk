import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronsUpDown, Lock, Plus, Settings } from 'lucide-react';
import { NodeIcon } from '@/components/NodeIcon';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import { invalidateLibrary } from '@/lib/queries';
import { paths } from '@/lib/routes';
import { useDialogs } from '@/stores/dialogs';
import { useSession } from '@/stores/session';
import { toastError } from '@/stores/toasts';
import { useLocationContext } from '../shell/context';

/**
 * Switcher del workspace (D5): il mondo in cui ci si trova, con il suo
 * colore. Dal menu si cambia workspace (anche con Ctrl+1…9), se ne crea uno
 * nuovo o si cambia profilo.
 */
export function WorkspaceSwitcher({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { workspace, workspaces } = useLocationContext();
  const openCreate = useDialogs((state) => state.openCreate);

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={t('switcher.label', { name: workspace?.node.name ?? '' })}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md text-left transition-colors duration-120',
            'hover:bg-hover data-[state=open]:bg-press',
            collapsed ? 'justify-center p-1' : 'bg-surface/70 shadow-1 p-1.5',
          )}
        >
          {workspace ? (
            <NodeIcon
              kind="workspace"
              name={workspace.node.name}
              icon={workspace.node.icon}
              color={workspace.node.colorMain}
              size="md"
            />
          ) : (
            <span className="bg-hover size-7 rounded-[7px]" aria-hidden />
          )}
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="text-ink block truncate text-sm font-semibold">
                  {workspace?.node.name ?? t('switcher.none')}
                </span>
                {workspace && (
                  <span className="text-2xs text-ink-3 block truncate">
                    {t('switcher.projects', { count: workspace.projectCount })}
                  </span>
                )}
              </span>
              <ChevronsUpDown className="text-ink-3 mr-1 size-3.5 shrink-0" aria-hidden />
            </>
          )}
        </button>
      </MenuTrigger>

      <MenuContent className="w-72" side={collapsed ? 'right' : 'bottom'}>
        <MenuLabel>{t('switcher.workspaces')}</MenuLabel>
        {workspaces.map((entry, index) => (
          <MenuItem
            key={entry.node.id}
            selected={entry.node.id === workspace?.node.id}
            shortcut={index < 9 ? `Ctrl+${index + 1}` : undefined}
            icon={
              <NodeIcon
                kind="workspace"
                name={entry.node.name}
                icon={entry.node.icon}
                color={entry.node.colorMain}
                size="sm"
              />
            }
            onSelect={() => navigate(entry.lastRoute ?? paths.workspace(entry.node.id))}
          >
            <span className="flex items-center gap-1.5">
              {entry.node.name}
              {entry.node.isProtected && (
                <Lock className="text-ink-3 size-3!" aria-label={t('states.protected')} />
              )}
            </span>
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem
          icon={<Plus />}
          onSelect={() => openCreate({ kind: 'workspace', parentId: null, workspaceId: null })}
        >
          {t('create.title.workspace')}
        </MenuItem>
        <MenuSeparator />
        <ProfileItems />
      </MenuContent>
    </Menu>
  );
}

/** Profili e impostazioni: gli stessi nello switcher e nel menu del profilo. */
export function ProfileItems() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profiles = useSession((state) => state.profiles);
  const activeProfileId = useSession((state) => state.activeProfileId);
  const activateProfile = useSession((state) => state.activateProfile);
  const openNewProfile = useDialogs((state) => state.openNewProfile);

  const switchTo = async (profileId: string) => {
    if (profileId === activeProfileId) return;
    try {
      await activateProfile(profileId);
      await invalidateLibrary();
      // I workspace dell'altro profilo sono altri: si riparte dal suo predefinito.
      navigate(paths.root);
    } catch (error) {
      toastError(t('profiles.switchFailed'), error);
    }
  };

  return (
    <>
      <MenuLabel>{t('switcher.profile')}</MenuLabel>
      {profiles.map((profile) => (
        <MenuItem
          key={profile.id}
          selected={profile.id === activeProfileId}
          icon={<ProfileAvatar profile={profile} size="xs" />}
          onSelect={() => void switchTo(profile.id)}
        >
          {profile.name}
        </MenuItem>
      ))}
      <MenuItem icon={<Plus />} onSelect={openNewProfile}>
        {t('profiles.newTitle')}
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Settings />} shortcut="Ctrl+," onSelect={() => navigate(paths.settings)}>
        {t('nav.settings')}
      </MenuItem>
    </>
  );
}
