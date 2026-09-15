import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Link2, Lock } from 'lucide-react';
import { NodeIcon } from '@/components/NodeIcon';
import { Skeleton } from '@/components/ui/feedback';
import { Tip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { duration, easeOut } from '@/lib/motion';
import { useChildren, useNodeView } from '@/lib/queries';
import { parseNodeRoute, paths } from '@/lib/routes';
import { useUi } from '@/stores/ui';
import type { NodeEntry } from '@/types/generated/NodeEntry';

interface ProjectNavProps {
  workspaceId: string;
  collapsed: boolean;
}

/**
 * I progetti del workspace attivo. Espandendo un progetto compaiono i suoi
 * sottoprogetti: due livelli, mai di piu'.
 */
export function ProjectNav({ workspaceId, collapsed }: ProjectNavProps) {
  const { t } = useTranslation();
  const view = useNodeView(workspaceId, workspaceId);

  if (view.isLoading) {
    return (
      <div className="flex flex-col gap-2 px-2 pt-1">
        {[70, 55, 62].map((width) => (
          <Skeleton key={width} className="h-4" />
        ))}
      </div>
    );
  }

  const projects = (view.data?.children ?? []).filter((entry) => entry.node.kind === 'project');

  if (projects.length === 0) {
    return collapsed ? null : <p className="text-ink-3 px-2 py-1 text-xs">{t('nav.noProjects')}</p>;
  }

  return (
    <ul className="flex flex-col gap-px">
      {projects.map((entry) => (
        <ProjectItem
          key={entry.node.id}
          entry={entry}
          workspaceId={workspaceId}
          collapsed={collapsed}
        />
      ))}
    </ul>
  );
}

function ProjectItem({
  entry,
  workspaceId,
  collapsed,
}: {
  entry: NodeEntry;
  workspaceId: string;
  collapsed: boolean;
}) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const route = parseNodeRoute(pathname);
  const expanded = useUi((state) => state.expanded[workspaceId]?.includes(entry.node.id) ?? false);
  const toggleExpanded = useUi((state) => state.toggleExpanded);

  const project = entry.node;
  const inProject = route.projectId === project.id;
  const open = expanded && !collapsed;

  // Entrando in un sottoprogetto (anche dal percorso o da un link) il progetto
  // si apre, cosi' la voce attiva e' visibile.
  const insideSubproject = inProject && !!route.subprojectId;
  useEffect(() => {
    if (insideSubproject) toggleExpanded(workspaceId, project.id, true);
  }, [insideSubproject, toggleExpanded, workspaceId, project.id]);
  const children = useChildren(project.id, open && entry.childCount > 0);
  const subprojects = (children.data ?? []).filter((child) => child.node.kind === 'subproject');
  const to = `${paths.workspace(workspaceId)}/p/${project.id}`;

  const row = (
    <NavLink
      to={to}
      aria-label={collapsed ? project.name : undefined}
      className={cn(
        'h-nav flex min-w-0 flex-1 items-center gap-2 rounded-sm text-sm transition-colors duration-120',
        collapsed ? 'justify-center' : 'pr-2',
        inProject && !route.subprojectId
          ? 'bg-accent-soft text-ink font-semibold'
          : inProject
            ? 'text-ink hover:bg-hover font-semibold'
            : 'text-ink-2 hover:bg-hover hover:text-ink',
      )}
    >
      <NodeIcon
        kind="project"
        name={project.name}
        icon={project.icon}
        color={project.colorMain}
        size={collapsed ? 'sm' : 'xs'}
      />
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1 truncate">{project.name}</span>
          {entry.parentCount > 1 && (
            <Link2 className="text-ink-3 size-3 shrink-0" aria-label={t('states.shared')} />
          )}
          {project.isProtected && (
            <Lock className="text-ink-3 size-3 shrink-0" aria-label={t('states.protected')} />
          )}
        </>
      )}
    </NavLink>
  );

  return (
    <li>
      <div className="flex items-center">
        {!collapsed && (
          <button
            type="button"
            aria-label={
              open
                ? t('nav.collapse', { name: project.name })
                : t('nav.expand', { name: project.name })
            }
            aria-expanded={open}
            disabled={entry.childCount === 0}
            onClick={() => toggleExpanded(workspaceId, project.id)}
            className="text-ink-3 hover:text-ink flex size-5 shrink-0 items-center justify-center rounded-xs disabled:invisible"
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform duration-120', open && 'rotate-90')}
            />
          </button>
        )}
        {collapsed ? (
          <Tip label={project.name} side="right">
            {row}
          </Tip>
        ) : (
          row
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && subprojects.length > 0 && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: duration.sidebar, ease: easeOut }}
            className="overflow-hidden"
          >
            {subprojects.map((child) => {
              const active = route.subprojectId === child.node.id;
              return (
                <li key={child.node.id}>
                  <NavLink
                    to={`${to}/s/${child.node.id}`}
                    className={cn(
                      'h-nav ml-5 flex items-center rounded-sm pr-2 pl-6 text-sm transition-colors duration-120',
                      active
                        ? 'bg-accent-soft text-ink font-semibold'
                        : 'text-ink-2 hover:bg-hover hover:text-ink',
                    )}
                  >
                    <span className="truncate">{child.node.name}</span>
                  </NavLink>
                </li>
              );
            })}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}
