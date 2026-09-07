import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { Clock, FolderPlus, LayoutDashboard, MoonStar, Star } from 'lucide-react';
import { Button, EmptyState, GlassPanel, PromptDialog } from '@/components/ui';
import { ipc, isTauri } from '@/lib/ipc';
import { staggerContainer, staggerItem } from '@/lib/motion';
import { useActiveProfile, useSessionStore } from '@/stores/sessionStore';
import { useDataStore } from '@/stores/dataStore';
import { useOpenStore } from '@/features/danger-zone/openStore';
import { ApplicationRow } from './ApplicationRow';
import { useNavigate } from 'react-router-dom';
import type { ApplicationWithLinks } from '@/types/domain';

/** Widget in vetro con titolo e icona: la griglia della dashboard. */
function Widget({
  icon,
  title,
  children,
  empty,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  empty?: string;
}) {
  return (
    <motion.section variants={staggerItem}>
      <GlassPanel radius="3xl" className="flex flex-col gap-3 p-5">
        <header className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400">
          {icon}
          <h2 className="text-xs font-semibold tracking-wide uppercase">{title}</h2>
        </header>
        {empty ? (
          <p className="py-4 text-center text-sm text-zinc-400 dark:text-zinc-600">{empty}</p>
        ) : (
          <div className="flex flex-col gap-1.5">{children}</div>
        )}
      </GlassPanel>
    </motion.section>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const profile = useActiveProfile();
  const profileId = useSessionStore((state) => state.activeProfileId);

  const containers = useDataStore((state) => state.containers);
  const health = useDataStore((state) => state.health);
  const loadHealth = useDataStore((state) => state.loadHealth);
  const createContainer = useDataStore((state) => state.createContainer);
  const requestOpen = useOpenStore((state) => state.requestOpen);
  const setOnOpened = useOpenStore((state) => state.setOnOpened);

  const [favourites, setFavourites] = useState<ApplicationWithLinks[]>([]);
  const [recents, setRecents] = useState<ApplicationWithLinks[]>([]);
  const [creating, setCreating] = useState(false);

  const reload = () => {
    if (!profileId || !isTauri()) return;
    void ipc
      .favouriteApplications(profileId)
      .then(setFavourites)
      .catch(() => setFavourites([]));
    void ipc
      .recentApplications(profileId, 6)
      .then(setRecents)
      .catch(() => setRecents([]));
    void loadHealth();
  };

  useEffect(reload, [profileId, loadHealth]);

  // Aprire un link deve aggiornare i "Recenti" senza che l'utente ricarichi nulla.
  useEffect(() => {
    setOnOpened(reload);
    return () => setOnOpened(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId]);

  const dormant = Object.values(health).filter((usage) => usage.staleness === 'dormant');
  const isEmpty = containers.length === 0 && favourites.length === 0 && recents.length === 0;

  if (isEmpty) {
    return (
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-8 py-6"
      >
        <motion.header variants={staggerItem} className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            {t('dashboard.title')}
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('dashboard.greeting')}
            {profile ? ` — ${profile.name}` : ''}
          </p>
        </motion.header>

        <motion.div variants={staggerItem}>
          <EmptyState
            icon={<LayoutDashboard strokeWidth={1.5} className="size-7" />}
            title={t('dashboard.empty.title')}
            description={t('dashboard.empty.description')}
            actions={
              <Button variant="accent" size="lg" onClick={() => setCreating(true)}>
                <FolderPlus strokeWidth={1.75} className="size-4" />
                {t('dashboard.empty.createProject')}
              </Button>
            }
          />
        </motion.div>

        <PromptDialog
          open={creating}
          title={t('navigator.new.project')}
          label={t('editor.name')}
          onCancel={() => setCreating(false)}
          onConfirm={(name) => {
            setCreating(false);
            void createContainer(null, 'project', name).then((created) => {
              if (created) navigate(`/c/${created.id}`);
            });
          }}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-6 py-6"
    >
      <motion.header variants={staggerItem} className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {t('dashboard.title')}
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t('dashboard.greeting')}
          {profile ? ` — ${profile.name}` : ''}
        </p>
      </motion.header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Widget
          icon={<Star strokeWidth={1.75} className="size-4" />}
          title={t('dashboard.widgets.favorites')}
          empty={favourites.length === 0 ? t('dashboard.widgets.noFavorites') : undefined}
        >
          {favourites.map((application) => (
            <ApplicationRow
              key={application.id}
              application={application}
              onOpen={(linkId) => void requestOpen(linkId)}
            />
          ))}
        </Widget>

        <Widget
          icon={<Clock strokeWidth={1.75} className="size-4" />}
          title={t('dashboard.widgets.recents')}
          empty={recents.length === 0 ? t('dashboard.widgets.noRecents') : undefined}
        >
          {recents.map((application) => (
            <ApplicationRow
              key={application.id}
              application={application}
              onOpen={(linkId) => void requestOpen(linkId)}
            />
          ))}
        </Widget>

        {/* Health check: solo cronologia locale, nessuna richiesta di rete. */}
        {dormant.length > 0 && (
          <Widget
            icon={<MoonStar strokeWidth={1.75} className="size-4" />}
            title={t('health.title')}
          >
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {t('health.summary', { count: dormant.length })}
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-600">{t('health.dormantHint')}</p>
          </Widget>
        )}
      </div>
    </motion.div>
  );
}
