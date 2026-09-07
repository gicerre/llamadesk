import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { CalendarClock, Layers, Plus, Rocket, Trash2, X } from 'lucide-react';
import { Button, EmptyState, GlassPanel, PromptDialog, SearchInput } from '@/components/ui';
import { cn } from '@/lib/cn';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { ipc, isTauri } from '@/lib/ipc';
import { useSessionStore } from '@/stores/sessionStore';
import { useOpenStore } from '@/features/danger-zone/openStore';
import { DangerBadge } from '@/features/danger-zone/DangerBadge';
import type { BundleWithLinks, SearchHit } from '@/types/domain';

/** Ricerca di un link da aggiungere: riusa l'indice della Command Palette. */
function LinkPicker({ onPick }: { onPick: (linkId: string) => void }) {
  const { t } = useTranslation();
  const profileId = useSessionStore((state) => state.activeProfileId);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);

  useEffect(() => {
    if (!profileId || !isTauri() || query.trim().length === 0) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void ipc
        .search(profileId, query)
        .then((results) => {
          if (!cancelled) setHits(results.filter((hit) => hit.entityType === 'link'));
        })
        .catch(() => undefined);
    }, 90);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, profileId]);

  const results = query.trim().length === 0 ? [] : hits;

  return (
    <div className="flex flex-col gap-1.5">
      <SearchInput value={query} onValueChange={setQuery} placeholder={t('workspaces.findLink')} />
      {results.length > 0 && (
        <ul className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
          {results.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(hit.id);
                  setQuery('');
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-sm transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.07]"
              >
                <Plus strokeWidth={2} className="size-3.5 shrink-0 text-zinc-400" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{hit.name}</span>
                  <span className="truncate text-[0.625rem] text-zinc-500">{hit.path}</span>
                </span>
                <DangerBadge level={hit.dangerLevel} compact />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Quick Workspaces: insiemi di link che si aprono insieme.
 *
 * Non seguono la gerarchia perché non la rispettano: "Standup del lunedì" pesca
 * dalla produzione di un cliente, dal Jira di un altro e dalla mail aziendale.
 */
export function WorkspacesPage() {
  const { t } = useTranslation();
  const profileId = useSessionStore((state) => state.activeProfileId);
  const requestOpenMany = useOpenStore((state) => state.requestOpenMany);

  const [bundles, setBundles] = useState<BundleWithLinks[]>([]);
  const [creating, setCreating] = useState(false);
  const [temporary, setTemporary] = useState(false);

  const reload = useCallback(() => {
    if (!profileId || !isTauri()) return;
    void ipc
      .listBundles(profileId)
      .then(setBundles)
      .catch(() => setBundles([]));
  }, [profileId]);

  useEffect(reload, [reload]);

  const create = (name: string) => {
    if (!profileId) return;
    // Un workspace temporaneo scade a fine giornata: "per oggi" deve
    // significare davvero per oggi.
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 0);
    const expiresAt = temporary ? endOfDay.toISOString().slice(0, 19).replace('T', ' ') : undefined;

    void ipc.createBundle(profileId, name, expiresAt).then(reload);
    setCreating(false);
    setTemporary(false);
  };

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-6 py-6"
    >
      <motion.header variants={staggerItem} className="flex flex-wrap items-center gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t('nav.quickWorkspaces')}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">{t('workspaces.subtitle')}</p>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            setTemporary(true);
            setCreating(true);
          }}
        >
          <CalendarClock strokeWidth={1.75} className="size-4" />
          {t('workspaces.newTemporary')}
        </Button>
        <Button
          variant="accent"
          onClick={() => {
            setTemporary(false);
            setCreating(true);
          }}
        >
          <Plus strokeWidth={1.75} className="size-4" />
          {t('workspaces.new')}
        </Button>
      </motion.header>

      {bundles.length === 0 ? (
        <motion.div variants={staggerItem}>
          <EmptyState
            icon={<Layers strokeWidth={1.5} className="size-7" />}
            title={t('workspaces.emptyTitle')}
            description={t('workspaces.emptyHint')}
          />
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {bundles.map((bundle) => (
            <motion.section key={bundle.id} variants={staggerItem}>
              <GlassPanel radius="3xl" className="flex flex-col gap-3 p-5">
                <header className="flex items-center gap-2">
                  <h2 className="flex-1 truncate text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {bundle.icon ? `${bundle.icon} ` : ''}
                    {bundle.name}
                  </h2>

                  {bundle.isTemporary && (
                    <span className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[0.625rem] font-medium text-orange-600 dark:text-orange-400">
                      <CalendarClock strokeWidth={2} className="size-2.5" />
                      {t('workspaces.temporary')}
                    </span>
                  )}

                  <Button
                    size="sm"
                    variant="accent"
                    disabled={bundle.links.length === 0}
                    onClick={() => void requestOpenMany(bundle.links.map((link) => link.id))}
                  >
                    <Rocket strokeWidth={1.75} className="size-3.5" />
                    {t('common.openAll')} ({bundle.links.length})
                  </Button>

                  <Button
                    size="icon"
                    variant="ghost"
                    title={t('common.delete')}
                    onClick={() => void ipc.deleteBundle(bundle.id).then(reload)}
                  >
                    <Trash2 strokeWidth={1.75} className="size-4" />
                  </Button>
                </header>

                <ul className="flex flex-col gap-1">
                  {bundle.links.map((link) => (
                    <li
                      key={link.id}
                      className={cn(
                        'flex items-center gap-2 rounded-xl px-2.5 py-1.5',
                        'bg-black/[0.03] dark:bg-white/[0.04]',
                      )}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm text-zinc-800 dark:text-zinc-100">
                          {link.name}
                        </span>
                        <span className="truncate font-mono text-[0.625rem] text-zinc-500">
                          {link.url}
                        </span>
                      </span>
                      <DangerBadge level={link.dangerLevel ?? 'normal'} compact />
                      <button
                        type="button"
                        onClick={() => void ipc.removeBundleLink(bundle.id, link.id).then(reload)}
                        aria-label={t('common.delete')}
                        className="rounded-lg p-1 text-zinc-400 hover:bg-black/[0.06] hover:text-zinc-700 dark:hover:bg-white/10"
                      >
                        <X strokeWidth={2} className="size-3" />
                      </button>
                    </li>
                  ))}
                </ul>

                <LinkPicker
                  onPick={(linkId) => void ipc.addBundleLink(bundle.id, linkId).then(reload)}
                />
              </GlassPanel>
            </motion.section>
          ))}
        </div>
      )}

      <PromptDialog
        open={creating}
        title={temporary ? t('workspaces.newTemporary') : t('workspaces.new')}
        label={t('editor.name')}
        placeholder={t('workspaces.namePlaceholder')}
        onCancel={() => setCreating(false)}
        onConfirm={create}
      />
    </motion.div>
  );
}
