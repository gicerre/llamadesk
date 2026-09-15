import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CalendarDays, Layers, StickyNote } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ipc, isTauri } from '@/lib/ipc';
import { springSnappy } from '@/lib/motion';
import { useDataStore } from '@/stores/dataStore';
import { useUiStore } from '@/stores/uiStore';
import { useOpenStore } from '@/features/danger-zone/openStore';
import { KIND_ICON } from '@/features/navigator/hierarchy';
import { ApplicationRow } from '../ApplicationRow';
import type {
  ApplicationWithLinks,
  BundleWithLinks,
  LinkInContext,
  NoteInContext,
  Tag,
  WidgetKind,
} from '@/types/domain';

interface ContentProps {
  profileId: string;
  /** Righe da mostrare; `Infinity` per i widget che non sono elenchi. */
  limit: number;
  /** Cambia quando si apre un link: i widget che dipendono dall'uso si ricaricano. */
  version: number;
}

/** Carica in un effetto e scarta il risultato se nel frattempo è cambiato qualcosa. */
function load<T>(promise: Promise<T>, apply: (value: T) => void): () => void {
  let cancelled = false;
  promise
    .then((value) => {
      if (!cancelled) apply(value);
    })
    .catch(() => undefined);
  return () => {
    cancelled = true;
  };
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-4 text-center text-sm text-zinc-400 dark:text-zinc-600">{children}</p>;
}

function List({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1.5">{children}</div>;
}

/** Riga generica dei widget: stessa forma di `ApplicationRow`. */
function Row({
  icon,
  title,
  subtitle,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      type="button"
      whileHover={disabled ? undefined : { x: 2 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={springSnappy}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex items-center gap-3 rounded-xl px-2.5 py-2 text-left',
        'transition-colors duration-200 hover:bg-black/[0.05] dark:hover:bg-white/[0.07]',
        'disabled:cursor-default disabled:opacity-60 disabled:hover:bg-transparent',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-black/[0.05] text-sm text-zinc-500 dark:bg-white/[0.07] dark:text-zinc-400">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
          {title}
        </span>
        {subtitle && <span className="text-[0.6875rem] text-zinc-500">{subtitle}</span>}
      </span>
    </motion.button>
  );
}

/* ------------------------------------------------------------ applicazioni */

function Applications({ items, empty }: { items: ApplicationWithLinks[]; empty: string }) {
  const requestOpen = useOpenStore((state) => state.requestOpen);
  if (items.length === 0) return <Empty>{empty}</Empty>;
  return (
    <List>
      {items.map((application) => (
        <ApplicationRow
          key={application.id}
          application={application}
          onOpen={(linkId) => void requestOpen(linkId)}
        />
      ))}
    </List>
  );
}

function Favorites({ profileId, limit, version }: ContentProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ApplicationWithLinks[]>([]);

  useEffect(() => {
    if (!isTauri()) return;
    return load(ipc.favouriteApplications(profileId), setItems);
  }, [profileId, version]);

  return <Applications items={items.slice(0, limit)} empty={t('dashboard.widgets.noFavorites')} />;
}

function Recents({ profileId, limit, version }: ContentProps) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ApplicationWithLinks[]>([]);

  useEffect(() => {
    if (!isTauri()) return;
    return load(ipc.recentApplications(profileId, limit), setItems);
  }, [profileId, limit, version]);

  return <Applications items={items} empty={t('dashboard.widgets.noRecents')} />;
}

/* ------------------------------------------------------ workspace rapidi */

function QuickWorkspaces({ profileId, limit, version }: ContentProps) {
  const { t } = useTranslation();
  const requestOpenMany = useOpenStore((state) => state.requestOpenMany);
  const [bundles, setBundles] = useState<BundleWithLinks[]>([]);

  useEffect(() => {
    if (!isTauri()) return;
    return load(ipc.listBundles(profileId), setBundles);
  }, [profileId, version]);

  if (bundles.length === 0) return <Empty>{t('dashboard.widgets.noQuickWorkspaces')}</Empty>;

  // Un clic apre tutto il workspace: è l'unica cosa per cui esiste.
  return (
    <List>
      {bundles.slice(0, limit).map((bundle) => (
        <Row
          key={bundle.id}
          icon={bundle.icon ?? <Layers strokeWidth={1.75} className="size-4" />}
          title={bundle.name}
          subtitle={`${t('common.openAll')} · ${t('dashboard.linkCount', { count: bundle.links.length })}`}
          disabled={bundle.links.length === 0}
          onClick={() => void requestOpenMany(bundle.links.map((link) => link.id))}
        />
      ))}
    </List>
  );
}

/* -------------------------------------------------------------- calendari */

function Calendars({ profileId, limit, version }: ContentProps) {
  const { t } = useTranslation();
  const requestOpen = useOpenStore((state) => state.requestOpen);
  const [links, setLinks] = useState<LinkInContext[]>([]);

  useEffect(() => {
    if (!isTauri()) return;
    return load(ipc.calendarLinks(profileId), setLinks);
  }, [profileId, version]);

  if (links.length === 0) return <Empty>{t('dashboard.widgets.noCalendars')}</Empty>;

  return (
    <List>
      {links.slice(0, limit).map((link) => (
        <Row
          key={link.id}
          icon={link.icon ?? <CalendarDays strokeWidth={1.75} className="size-4" />}
          title={link.name}
          subtitle={`${link.applicationName} · ${link.containerName}`}
          onClick={() => void requestOpen(link.id)}
        />
      ))}
    </List>
  );
}

/* --------------------------------------------------------------- progetti */

function Projects({ limit }: ContentProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const containers = useDataStore((state) => state.containers);

  const projects = containers.filter((node) => node.parentId === null && node.kind === 'project');
  if (projects.length === 0) return <Empty>{t('dashboard.widgets.noProjects')}</Empty>;

  return (
    <List>
      {projects.slice(0, limit).map((project) => {
        const children = containers.filter((node) => node.parentId === project.id).length;
        return (
          <Row
            key={project.id}
            icon={project.icon ?? KIND_ICON.project}
            title={project.name}
            subtitle={t('dashboard.childCount', { count: children })}
            onClick={() => navigate(`/c/${project.id}`)}
          />
        );
      })}
    </List>
  );
}

/* ------------------------------------------------------------------- note */

function Notes({ profileId, limit, version }: ContentProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<NoteInContext[]>([]);

  useEffect(() => {
    if (!isTauri()) return;
    return load(ipc.recentNotes(profileId, limit), setNotes);
  }, [profileId, limit, version]);

  if (notes.length === 0) return <Empty>{t('dashboard.widgets.noNotes')}</Empty>;

  return (
    <List>
      {notes.map((note) => (
        <Row
          key={note.id}
          icon={<StickyNote strokeWidth={1.75} className="size-4" />}
          title={note.title}
          // Il markdown non si rende qui: basta la prima riga per riconoscerla.
          subtitle={<span className="line-clamp-1">{note.content.trim().split('\n')[0]}</span>}
          disabled={!note.containerId}
          onClick={() => note.containerId && navigate(`/c/${note.containerId}`)}
        />
      ))}
    </List>
  );
}

/* -------------------------------------------------------------------- tag */

function Tags({ profileId, version }: ContentProps) {
  const { t } = useTranslation();
  const openPalette = useUiStore((state) => state.openPalette);
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    if (!isTauri()) return;
    return load(ipc.listTags(profileId), setTags);
  }, [profileId, version]);

  if (tags.length === 0) return <Empty>{t('dashboard.widgets.noTags')}</Empty>;

  // Un tag porta alla ricerca, che sui link pesa anche i tag.
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <button
          key={tag.id}
          type="button"
          onClick={() => openPalette(tag.name)}
          className="rounded-full bg-black/[0.05] px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-black/[0.09] dark:bg-white/[0.07] dark:text-zinc-300 dark:hover:bg-white/[0.12]"
        >
          #{tag.name}
        </button>
      ))}
    </div>
  );
}

const CONTENT: Record<WidgetKind, (props: ContentProps) => ReactNode> = {
  favorites: Favorites,
  recents: Recents,
  quick_workspaces: QuickWorkspaces,
  calendars: Calendars,
  projects: Projects,
  notes: Notes,
  tags: Tags,
};

/** Il contenuto di un widget, scelto dal suo tipo. */
export function WidgetContent({ kind, ...props }: ContentProps & { kind: WidgetKind }) {
  const Content = CONTENT[kind];
  return <Content {...props} />;
}
