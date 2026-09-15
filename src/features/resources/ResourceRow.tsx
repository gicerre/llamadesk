import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import { GitBranch, Globe, Layers, Lock, ShieldAlert } from 'lucide-react';
import { createElement } from 'react';
import { cn } from '@/lib/cn';
import { useChildren } from '@/lib/queries';
import { displayUrl, formatBytes, hueForUrl, monogramForUrl, shortenPath } from '@/lib/resources';
import type { NodeEntry } from '@/types/generated/NodeEntry';
import type { PathInfo } from '@/types/generated/PathInfo';
import { fileGlyph } from './glyphs';

/* ============================================================================
   Righe delle risorse (docs/REDESIGN.md, "Link group e file").

   Ogni tipo si riconosce prima di leggerne il nome: il link ha un monogramma
   colorato dal dominio, il gruppo e' l'unico oggetto con la forma "a pila",
   il percorso mostra cio' che il disco dice di lui (file, cartella,
   repository con il branch, oppure mancante).
   ========================================================================== */

interface ResourceRowProps extends React.HTMLAttributes<HTMLDivElement> {
  entry: NodeEntry;
  pathInfo?: PathInfo;
  selected?: boolean;
  /** Cosa fare con un percorso mancante: scegliere dove si trova ora. */
  onLocate?: () => void;
  actions?: React.ReactNode;
}

export const ResourceRow = forwardRef<HTMLDivElement, ResourceRowProps>(
  ({ entry, pathInfo, selected, onLocate, actions, className, ...props }, ref) => {
    const { t, i18n } = useTranslation();
    const { node } = entry;
    const missing =
      node.kind === 'path' && (pathInfo?.kind === 'missing' || pathInfo?.kind === 'unavailable');

    return (
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        className={cn(
          'group/row h-row relative flex w-full min-w-0 items-center gap-3 rounded-md px-2.5 text-left outline-offset-2',
          'transition-shadow duration-120',
          missing
            ? 'bg-transparent [background-image:repeating-linear-gradient(135deg,transparent_0_6px,var(--ld-hover)_6px_7px)] shadow-[inset_0_0_0_1px_var(--ld-line-strong)]'
            : 'bg-surface shadow-1 hover:shadow-2',
          selected &&
            'shadow-[0_0_0_2px_var(--ld-accent)]! hover:shadow-[0_0_0_2px_var(--ld-accent)]!',
          node.kind === 'link_group' && 'isolate mb-1.5',
          node.enabled === false && 'opacity-60',
          className,
        )}
        {...props}
      >
        {node.kind === 'link_group' && <StackEdges />}
        <Leading entry={entry} pathInfo={pathInfo} />

        <span className="min-w-0 flex-1">
          <span className="text-ink flex min-w-0 items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{node.name}</span>
            {pathInfo?.gitBranch && (
              <span className="bg-hover text-2xs text-ink-2 flex shrink-0 items-center gap-1 rounded-xs px-1.5 font-mono font-medium">
                <GitBranch className="size-3" aria-hidden />
                {pathInfo.gitBranch}
              </span>
            )}
            {node.isProtected && (
              <Lock className="text-ink-3 size-3 shrink-0" aria-label={t('states.protected')} />
            )}
            {node.caution && node.caution !== 'none' && (
              <ShieldAlert
                className="text-danger size-3 shrink-0"
                aria-label={t('states.caution')}
              />
            )}
          </span>
          <Secondary entry={entry} pathInfo={pathInfo} locale={i18n.language} />
        </span>

        {missing && onLocate && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onLocate();
            }}
            className="bg-hover text-ink-2 hover:bg-press hover:text-ink h-7 shrink-0 rounded-sm px-2.5 text-xs font-semibold"
          >
            {t('resources.locate')}
          </button>
        )}
        {node.kind === 'link_group' && (
          <span className="bg-accent-soft text-accent shrink-0 rounded-sm px-2 py-0.5 text-xs font-semibold tabular-nums">
            {t('kinds.count.link', { count: entry.childCount })}
          </span>
        )}
        {actions && (
          <span className="flex shrink-0 items-center opacity-0 transition-opacity duration-120 group-focus-within/row:opacity-100 group-hover/row:opacity-100">
            {actions}
          </span>
        )}
      </div>
    );
  },
);
ResourceRow.displayName = 'ResourceRow';

/** I due bordi sfalsati sotto la card: la "pila" dei gruppi di link. */
function StackEdges() {
  return (
    <>
      <span
        aria-hidden
        className="bg-surface shadow-1 absolute inset-x-2 -bottom-1 -z-10 h-3 rounded-b-md"
      />
      <span
        aria-hidden
        className="bg-surface shadow-1 absolute inset-x-4 -bottom-2 -z-20 h-3 rounded-b-md opacity-70"
      />
    </>
  );
}

function Leading({ entry, pathInfo }: { entry: NodeEntry; pathInfo: PathInfo | undefined }) {
  const { node } = entry;
  const box = 'flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4';

  if (node.kind === 'link') {
    const hue = hueForUrl(node.url);
    return (
      <span
        aria-hidden
        className={cn(box, 'font-display text-sm font-bold text-white')}
        style={{ background: `oklch(0.58 0.09 ${hue})` }}
      >
        {node.url?.startsWith('mailto:') ? <Globe /> : monogramForUrl(node.url, node.name)}
      </span>
    );
  }

  if (node.kind === 'link_group') {
    return (
      <span aria-hidden className={cn(box, 'bg-accent-soft text-accent')}>
        <Layers />
      </span>
    );
  }

  const missing = pathInfo?.kind === 'missing' || pathInfo?.kind === 'unavailable';
  return (
    <span
      aria-hidden
      className={cn(box, missing ? 'bg-caution-soft text-caution' : 'bg-hover text-ink-2')}
    >
      {createElement(fileGlyph(pathInfo))}
    </span>
  );
}

function Secondary({
  entry,
  pathInfo,
  locale,
}: {
  entry: NodeEntry;
  pathInfo: PathInfo | undefined;
  locale: string;
}) {
  const { t } = useTranslation();
  const { node } = entry;
  const line = 'block truncate text-2xs text-ink-3';

  if (node.kind === 'link') {
    return <span className={cn(line, 'selectable font-mono')}>{displayUrl(node.url)}</span>;
  }
  if (node.kind === 'link_group') {
    return <GroupPreview groupId={node.id} count={entry.childCount} />;
  }

  if (pathInfo?.kind === 'missing') {
    return <span className={cn(line, 'text-caution')}>{t('resources.pathMissing')}</span>;
  }
  if (pathInfo?.kind === 'unavailable') {
    return <span className={cn(line, 'text-caution')}>{t('resources.pathUnavailable')}</span>;
  }
  const size =
    pathInfo?.kind === 'file' && pathInfo.sizeBytes !== null
      ? ` · ${formatBytes(pathInfo.sizeBytes, locale)}`
      : '';
  return (
    <span className={cn(line, 'selectable font-mono')} title={node.path ?? undefined}>
      {shortenPath(node.path ?? '')}
      {size}
    </span>
  );
}

/** "GitHub · Jira · Operate · +3": i link del gruppo, letti solo quando la riga c'e'. */
function GroupPreview({ groupId, count }: { groupId: string; count: number }) {
  const { t } = useTranslation();
  const children = useChildren(groupId, count > 0);
  const names = (children.data ?? []).map((child) => child.node.name);
  const shown = names.slice(0, 3);
  const text =
    count === 0
      ? t('resources.groupEmpty')
      : shown.join(' · ') +
        (names.length > shown.length ? ` · +${names.length - shown.length}` : '');
  return <span className="text-2xs text-ink-3 block truncate">{text || '…'}</span>;
}
