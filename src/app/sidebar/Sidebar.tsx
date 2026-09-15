import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { Clock, House, Plus, Star } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { useNarrowWindow } from '@/lib/viewport';
import { paths } from '@/lib/routes';
import { useDialogs } from '@/stores/dialogs';
import { useUi } from '@/stores/ui';
import { useLocationContext } from '../shell/context';
import { SIDEBAR_WIDTH } from '../shell/layout';
import { ProfileMenu } from './ProfileMenu';
import { ProjectNav } from './ProjectNav';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

/**
 * Sidebar corta (docs/REDESIGN.md § 9): switcher del workspace, tre voci fisse
 * e i progetti del workspace attivo con i loro sottoprogetti. Mai sezioni o
 * risorse: la sidebar orienta, non e' un file explorer.
 */
export function Sidebar() {
  const { t } = useTranslation();
  // Sotto i 900 px la sidebar si riduce da sola, senza cambiare la scelta salvata.
  const narrow = useNarrowWindow();
  const collapsed = useUi((state) => state.sidebarCollapsed) || narrow;
  const { workspace, workspaceId } = useLocationContext();
  const openCreate = useDialogs((state) => state.openCreate);

  return (
    <aside
      aria-label={t('shell.sidebar')}
      className="flex shrink-0 flex-col overflow-hidden transition-[width] duration-200 ease-out"
      style={{ width: collapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded }}
    >
      <div className={cn('pt-1 pb-3', collapsed ? 'px-2' : 'px-3')}>
        <WorkspaceSwitcher collapsed={collapsed} />
      </div>

      {workspaceId && (
        <nav className={cn('flex flex-col gap-px', collapsed ? 'px-2' : 'px-3')}>
          <NavItem
            to={paths.workspace(workspaceId)}
            icon={<House />}
            label={t('nav.home')}
            collapsed={collapsed}
            end
          />
          <NavItem
            to={paths.favorites(workspaceId)}
            icon={<Star />}
            label={t('nav.favorites')}
            collapsed={collapsed}
          />
          <NavItem
            to={paths.recents(workspaceId)}
            icon={<Clock />}
            label={t('nav.recents')}
            collapsed={collapsed}
          />
        </nav>
      )}

      {workspace && (
        <section className="mt-4 flex min-h-0 flex-1 flex-col">
          {!collapsed && (
            <header className="flex h-7 items-center pr-3 pl-5">
              <h2 className="text-2xs text-ink-3 flex-1 font-semibold tracking-[0.08em] uppercase">
                {t('nav.projects')}
              </h2>
              <Tip label={t('create.title.project')}>
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  aria-label={t('create.title.project')}
                  className="size-6"
                  onClick={() =>
                    openCreate({
                      kind: 'project',
                      parentId: workspace.node.id,
                      workspaceId: workspace.node.id,
                    })
                  }
                >
                  <Plus className="size-3.5!" />
                </Button>
              </Tip>
            </header>
          )}
          <div className={cn('min-h-0 flex-1 overflow-y-auto pb-3', collapsed ? 'px-2' : 'px-3')}>
            <ProjectNav workspaceId={workspace.node.id} collapsed={collapsed} />
          </div>
        </section>
      )}

      <div className={cn('border-chrome-line mt-auto border-t py-2', collapsed ? 'px-2' : 'px-3')}>
        <ProfileMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  collapsed: boolean;
  end?: boolean;
}

const navItemClass = (active: boolean, collapsed: boolean) =>
  cn(
    'flex h-nav w-full items-center gap-2.5 rounded-sm text-sm transition-colors duration-120',
    '[&>svg]:size-4 [&>svg]:shrink-0',
    collapsed ? 'justify-center' : 'px-2',
    active
      ? 'bg-accent-soft font-semibold text-ink [&>svg]:text-accent'
      : 'text-ink-2 hover:bg-hover hover:text-ink [&>svg]:text-ink-3',
  );

function NavItem({ to, icon, label, collapsed, end }: NavItemProps) {
  const link = (
    <NavLink
      to={to}
      end={end}
      aria-label={collapsed ? label : undefined}
      className={({ isActive }) => navItemClass(isActive, collapsed)}
    >
      {icon}
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
  return collapsed ? (
    <Tip label={label} side="right">
      {link}
    </Tip>
  ) : (
    link
  );
}
