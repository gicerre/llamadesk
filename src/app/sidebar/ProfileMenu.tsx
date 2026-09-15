import { useTranslation } from 'react-i18next';
import { Ellipsis } from 'lucide-react';
import { Menu, MenuContent, MenuTrigger } from '@/components/ui/Menu';
import { cn } from '@/lib/cn';
import { initials } from '@/lib/identity';
import { useActiveProfile } from '@/stores/session';
import { ProfileItems } from './WorkspaceSwitcher';

/** In fondo alla sidebar: chi sta usando l'app. Si cambia di rado. */
export function ProfileMenu({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const profile = useActiveProfile();
  if (!profile) return null;

  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          type="button"
          aria-label={t('profiles.menu', { name: profile.name })}
          className={cn(
            'text-ink-2 hover:bg-hover hover:text-ink data-[state=open]:bg-press flex h-9 w-full items-center gap-2.5 rounded-sm text-left text-sm transition-colors duration-120',
            collapsed ? 'justify-center' : 'px-1.5',
          )}
        >
          <span
            aria-hidden
            className="bg-brand text-2xs dark:text-sunken flex size-6 shrink-0 items-center justify-center rounded-full font-bold text-white"
            style={profile.colorMain ? { backgroundColor: profile.colorMain } : undefined}
          >
            {initials(profile.name)}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate font-medium">{profile.name}</span>
              <Ellipsis className="text-ink-3 size-4" aria-hidden />
            </>
          )}
        </button>
      </MenuTrigger>
      <MenuContent side={collapsed ? 'right' : 'top'} className="w-64">
        <ProfileItems />
      </MenuContent>
    </Menu>
  );
}
