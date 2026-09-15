import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMatch, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronsUpDown, Pencil, Plus, Trash2 } from 'lucide-react';
import { PromptDialog } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fadeFast, springBouncy } from '@/lib/motion';
import { useActiveProfile, useSessionStore } from '@/stores/sessionStore';
import type { Profile } from '@/types/domain';
import { DeleteProfileDialog } from './DeleteProfileDialog';

type Dialog =
  | { kind: 'create' }
  | { kind: 'rename'; id: string; name: string }
  | { kind: 'delete'; profile: Profile }
  | null;

/**
 * Selettore di profilo.
 *
 * Cambiare profilo non cambia solo i dati: applica anche tema, lingua e sfondo
 * di quel profilo, se li personalizza. Per questo passa da
 * `activateProfile`, che restituisce le impostazioni effettive in un colpo solo
 * invece di lasciare la UI a ricomporle.
 */
export function ProfileSwitcher() {
  const { t } = useTranslation();
  const profiles = useSessionStore((state) => state.profiles);
  const activeProfileId = useSessionStore((state) => state.activeProfileId);
  const activateProfile = useSessionStore((state) => state.activateProfile);
  const createProfile = useSessionStore((state) => state.createProfile);
  const renameProfile = useSessionStore((state) => state.renameProfile);
  const deleteProfile = useSessionStore((state) => state.deleteProfile);
  const overrides = useSessionStore((state) => state.profileOverrides);
  const active = useActiveProfile();

  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const navigate = useNavigate();
  const onContainerPage = useMatch('/c/:id') !== null;

  // Eliminando il profilo attivo, il backend ricade sul primo rimasto nello
  // stesso ordine dell'elenco: lo annunciamo già nella conferma.
  const deleting = dialog?.kind === 'delete' ? dialog.profile : null;
  const fallback =
    deleting?.id === activeProfileId
      ? (profiles.find((profile) => profile.id !== deleting.id) ?? null)
      : null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'no-drag flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left',
          'transition-colors duration-200 hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
        )}
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-400/80 to-cyan-400/80 text-base">
          {active?.icon ?? '\u{1F999}'}
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-semibold tracking-tight text-zinc-800 dark:text-zinc-100">
            {active?.name ?? '—'}
          </span>
          <span className="text-[0.6875rem] text-zinc-500 dark:text-zinc-500">
            {overrides.length > 0
              ? t('profiles.customised', { count: overrides.length })
              : t('nav.profile')}
          </span>
        </span>
        <ChevronsUpDown strokeWidth={1.75} className="size-3.5 shrink-0 text-zinc-400" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            {/* Chiusura al click fuori, senza listener globali da ripulire. */}
            <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />

            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: springBouncy }}
              exit={{ opacity: 0, y: -4, scale: 0.98, transition: fadeFast }}
              className="glass-popover absolute inset-x-0 z-30 mt-1 flex flex-col gap-0.5 rounded-2xl p-1.5"
            >
              {profiles.map((profile) => (
                <div key={profile.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      void activateProfile(profile.id);
                    }}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-black/[0.05] dark:hover:bg-white/[0.07]"
                  >
                    <span>{profile.icon ?? '\u{1F999}'}</span>
                    <span className="flex-1 truncate">{profile.name}</span>
                    {profile.id === activeProfileId && (
                      <Check strokeWidth={2.5} className="size-3.5 text-emerald-500" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setDialog({ kind: 'rename', id: profile.id, name: profile.name })
                    }
                    title={t('common.rename')}
                    className="rounded-lg p-1.5 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/[0.06] dark:hover:bg-white/10"
                  >
                    <Pencil strokeWidth={1.75} className="size-3" />
                  </button>

                  {/* L'ultimo profilo non si elimina: l'azione non esiste. */}
                  {profiles.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        setDialog({ kind: 'delete', profile });
                      }}
                      title={t('profiles.delete')}
                      className="rounded-lg p-1.5 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500/10 hover:text-red-500"
                    >
                      <Trash2 strokeWidth={1.75} className="size-3" />
                    </button>
                  )}
                </div>
              ))}

              <div className="my-0.5 h-px bg-black/[0.06] dark:bg-white/[0.08]" />

              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setDialog({ kind: 'create' });
                }}
                className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-zinc-600 transition-colors hover:bg-black/[0.05] dark:text-zinc-300 dark:hover:bg-white/[0.07]"
              >
                <Plus strokeWidth={2} className="size-3.5" />
                {t('profiles.create')}
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <PromptDialog
        open={dialog?.kind === 'create'}
        title={t('profiles.create')}
        label={t('editor.name')}
        placeholder={t('profiles.placeholder')}
        warn={(value) =>
          profiles.some((profile) => profile.name.toLowerCase() === value.toLowerCase())
            ? t('navigator.duplicateName')
            : null
        }
        onCancel={() => setDialog(null)}
        onConfirm={(name) => {
          setDialog(null);
          void createProfile(name);
        }}
      />

      <PromptDialog
        open={dialog?.kind === 'rename'}
        title={t('common.rename')}
        label={t('editor.name')}
        initialValue={dialog?.kind === 'rename' ? dialog.name : ''}
        onCancel={() => setDialog(null)}
        onConfirm={(name) => {
          if (dialog?.kind === 'rename') void renameProfile(dialog.id, name);
          setDialog(null);
        }}
      />

      <DeleteProfileDialog
        profile={deleting}
        fallback={fallback}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (!deleting) return;
          setDialog(null);
          void deleteProfile(deleting.id).then((deleted) => {
            // La pagina di un contenitore del profilo eliminato punterebbe a
            // un id che non esiste più.
            if (deleted && fallback && onContainerPage) navigate('/');
          });
        }}
      />
    </div>
  );
}
