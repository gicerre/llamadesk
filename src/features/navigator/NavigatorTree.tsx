import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronRight, Plus } from 'lucide-react';
import { PromptDialog } from '@/components/ui';
import { cn } from '@/lib/cn';
import { springSnappy } from '@/lib/motion';
import { useDataStore } from '@/stores/dataStore';
import { KIND_ICON } from './hierarchy';
import { useNavigatorDnd } from './useNavigatorDnd';
import type { Container, ContainerKind } from '@/types/domain';

interface NavigatorTreeProps {
  /** Radice logica: `project` per il ramo Progetti, `workspace` per gli strumenti. */
  rootKind: Extract<ContainerKind, 'project' | 'workspace'>;
  label: string;
}

/** Rientro per livello, in px: lo usa anche la linea di rilascio. */
const INDENT = 12;

interface TreeNodeProps {
  node: Container;
  depth: number;
  byParent: Map<string | null, Container[]>;
  activeId: string | undefined;
}

/**
 * Una riga dell'albero con il suo sottoramo.
 *
 * L'intera riga è trascinabile e fa da bersaglio: dove cade il nodo lo decide
 * `NavigatorDnd` dalla posizione del puntatore, qui si disegna soltanto.
 */
function TreeNode({ node, depth, byParent, activeId }: TreeNodeProps) {
  const navigate = useNavigate();
  const { expanded, toggle, draggingId, target, guardClick } = useNavigatorDnd();

  const draggable = useDraggable({ id: node.id });
  const droppable = useDroppable({ id: node.id });

  const children = byParent.get(node.id) ?? [];
  const isExpanded = expanded.has(node.id);
  const isActive = node.id === activeId;
  const isHot = node.dangerLevel === 'critical' || node.dangerLevel === 'danger';
  const isDragged = draggingId === node.id;
  const drop = target?.id === node.id ? target.position : null;

  return (
    <li>
      <div
        ref={(element) => {
          draggable.setNodeRef(element);
          droppable.setNodeRef(element);
        }}
        {...draggable.listeners}
        onClickCapture={guardClick}
        data-tree-row={node.id}
        className={cn(
          'group relative flex items-center gap-1 rounded-xl pr-1 transition-colors duration-200',
          drop === 'inside'
            ? 'bg-indigo-500/15 ring-2 ring-indigo-400/50'
            : isActive
              ? 'bg-black/[0.06] dark:bg-white/10'
              : !draggingId && 'hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
          isDragged && 'opacity-40',
        )}
        style={{ paddingLeft: `${depth * INDENT}px` }}
      >
        {(drop === 'before' || drop === 'after') && (
          <span
            className={cn(
              'pointer-events-none absolute right-1 h-0.5 rounded-full bg-indigo-500',
              drop === 'before' ? '-top-px' : '-bottom-px',
            )}
            style={{ left: `${depth * INDENT + 6}px` }}
          />
        )}

        <button
          type="button"
          onClick={() => toggle(node.id)}
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-md text-zinc-400',
            children.length === 0 && 'invisible',
          )}
          aria-label="toggle"
        >
          <motion.span animate={{ rotate: isExpanded ? 90 : 0 }} transition={springSnappy}>
            <ChevronRight strokeWidth={2} className="size-3.5" />
          </motion.span>
        </button>

        <button
          type="button"
          onClick={() => navigate(`/c/${node.id}`)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
        >
          <span className="text-xs">{node.icon ?? KIND_ICON[node.kind]}</span>
          <span
            className={cn(
              'truncate text-[0.8125rem]',
              isActive
                ? 'font-medium text-zinc-900 dark:text-zinc-50'
                : 'text-zinc-600 dark:text-zinc-300',
            )}
          >
            {node.name}
          </span>
          {isHot && <span className="pulse-danger size-1.5 shrink-0 rounded-full bg-red-500" />}
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && children.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            {children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                byParent={byParent}
                activeId={activeId}
              />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

/**
 * Albero della sidebar.
 *
 * L'intera gerarchia del profilo è già in memoria (poche centinaia di righe),
 * quindi espandere un ramo non costa una query: si filtra un array.
 * Espansione e drag & drop sono di `NavigatorDnd`, condiviso con l'altro albero.
 */
export function NavigatorTree({ rootKind, label }: NavigatorTreeProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id: activeId } = useParams<{ id: string }>();

  const containers = useDataStore((state) => state.containers);
  const createContainer = useDataStore((state) => state.createContainer);

  const [creating, setCreating] = useState(false);

  const byParent = useMemo(() => {
    const map = new Map<string | null, Container[]>();
    for (const container of containers) {
      const key = container.parentId;
      const bucket = map.get(key) ?? [];
      bucket.push(container);
      map.set(key, bucket);
    }
    return map;
  }, [containers]);

  const roots = (byParent.get(null) ?? []).filter((node) => node.kind === rootKind);

  return (
    <section className="flex flex-col gap-1">
      <header className="flex items-center justify-between px-2">
        <span className="text-[0.6875rem] font-semibold tracking-wide text-zinc-500 uppercase">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setCreating(true)}
          title={t(`navigator.new.${rootKind}`)}
          className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-black/[0.06] hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
        >
          <Plus strokeWidth={2} className="size-3.5" />
        </button>
      </header>

      <ul className="flex flex-col">
        {roots.map((node) => (
          <TreeNode key={node.id} node={node} depth={0} byParent={byParent} activeId={activeId} />
        ))}
      </ul>

      {roots.length === 0 && (
        <p className="px-2 py-1 text-[0.6875rem] text-zinc-400 dark:text-zinc-600">
          {t('navigator.emptyBranch')}
        </p>
      )}

      <PromptDialog
        open={creating}
        title={t(`navigator.new.${rootKind}`)}
        label={t('editor.name')}
        warn={(value) =>
          roots.some((node) => node.name.toLowerCase() === value.toLowerCase())
            ? t('navigator.duplicateName')
            : null
        }
        onCancel={() => setCreating(false)}
        onConfirm={(name) => {
          setCreating(false);
          void createContainer(null, rootKind, name).then((created) => {
            if (created) navigate(`/c/${created.id}`);
          });
        }}
      />
    </section>
  );
}
