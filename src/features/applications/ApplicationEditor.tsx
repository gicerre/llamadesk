import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Link2, Plus, Star, Trash2 } from 'lucide-react';
import { Button, Input, Modal, Switch } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useDataStore } from '@/stores/dataStore';
import { DangerLevelPicker } from '@/features/danger-zone/DangerLevelPicker';
import { NotePanel } from '@/features/notes/NotePanel';
import { TagInput } from '@/features/tags/TagInput';
import type { ApplicationWithLinks, DangerLevel, LinkKind } from '@/types/domain';
import { INHERIT } from '@/types/domain';

interface ApplicationEditorProps {
  application: ApplicationWithLinks | null;
  onClose: () => void;
}

const LINK_KINDS: LinkKind[] = ['web', 'calendar', 'mail', 'doc', 'other'];

/**
 * Editor di un'applicazione e dei suoi link.
 *
 * Un'unica schermata perché il modello mentale è unico: "questo strumento, e i
 * suoi indirizzi". Separare app e link in due dialoghi raddoppierebbe i clic
 * del gesto più frequente, cioè aggiungere un secondo URL a qualcosa che esiste.
 */
export function ApplicationEditor({ application, onClose }: ApplicationEditorProps) {
  const { t } = useTranslation();
  const {
    updateApplication,
    deleteApplication,
    duplicateApplication,
    createLink,
    updateLink,
    deleteLink,
  } = useDataStore();

  const [newLinkName, setNewLinkName] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkKind, setNewLinkKind] = useState<LinkKind>('web');

  if (!application) return null;

  const addLink = async () => {
    if (!newLinkName.trim() || !newLinkUrl.trim()) return;
    await createLink(application.id, newLinkName.trim(), newLinkUrl.trim(), newLinkKind);
    setNewLinkName('');
    setNewLinkUrl('');
    setNewLinkKind('web');
  };

  return (
    <Modal open onClose={onClose} labelledBy="application-editor-title" className="max-w-2xl">
      <div className="flex max-h-[75vh] flex-col gap-5 overflow-y-auto pr-1">
        <h2
          id="application-editor-title"
          className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
        >
          {application.name}
        </h2>

        {/* --- Identità --- */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <Input
            label={t('editor.name')}
            defaultValue={application.name}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value && value !== application.name) {
                void updateApplication(application.id, { name: value });
              }
            }}
          />
          <Input
            label={t('editor.icon')}
            defaultValue={application.icon ?? ''}
            placeholder="🚀"
            className="w-24 text-center text-lg"
            onBlur={(event) => void updateApplication(application.id, { icon: event.target.value })}
          />
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-black/[0.03] px-4 py-3 dark:bg-white/[0.04]">
          <span className="flex items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">
            <Star strokeWidth={1.75} className="size-4" />
            {t('editor.favorite')}
          </span>
          <Switch
            checked={application.isFavorite}
            onCheckedChange={(checked) =>
              void updateApplication(application.id, { isFavorite: checked })
            }
            aria-label={t('editor.favorite')}
          />
        </div>

        {/* --- Danger Zone --- */}
        <DangerLevelPicker
          value={application.dangerLevel}
          onChange={(level: DangerLevel | null) =>
            void updateApplication(application.id, { dangerLevel: level ?? INHERIT })
          }
        />

        {/* --- Tag e nota --- */}
        <TagInput entityType="application" entityId={application.id} />
        <NotePanel entityType="application" entityId={application.id} />

        {/* --- Link --- */}
        <section className="flex flex-col gap-2">
          <h3 className="px-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">
            {t('editor.links')}
          </h3>

          <ul className="flex flex-col gap-1.5">
            {application.links.map((link) => (
              <li
                key={link.id}
                className="flex items-center gap-2 rounded-xl bg-black/[0.03] p-2 dark:bg-white/[0.04]"
              >
                <Link2 strokeWidth={1.75} className="size-4 shrink-0 text-zinc-400" />
                <input
                  defaultValue={link.name}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (value && value !== link.name) void updateLink(link.id, { name: value });
                  }}
                  className="w-32 shrink-0 rounded-lg bg-transparent px-2 py-1 text-sm font-medium focus:bg-black/[0.05] dark:focus:bg-white/[0.07]"
                />
                <input
                  defaultValue={link.url}
                  onBlur={(event) => {
                    const value = event.target.value.trim();
                    if (value && value !== link.url) void updateLink(link.id, { url: value });
                  }}
                  className="min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 font-mono text-xs text-zinc-500 focus:bg-black/[0.05] dark:focus:bg-white/[0.07]"
                />
                <button
                  type="button"
                  title={t('editor.setDefault')}
                  onClick={() => void updateLink(link.id, { isDefault: true })}
                  className={cn(
                    'rounded-lg p-1.5 transition-colors',
                    link.isDefault
                      ? 'text-amber-400'
                      : 'text-zinc-400 hover:bg-black/[0.06] dark:hover:bg-white/10',
                  )}
                >
                  <Star
                    strokeWidth={2}
                    className={cn('size-3.5', link.isDefault && 'fill-current')}
                  />
                </button>
                <button
                  type="button"
                  title={t('common.delete')}
                  onClick={() => void deleteLink(link.id)}
                  className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-500/15 hover:text-red-500"
                >
                  <Trash2 strokeWidth={1.75} className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>

          {/* Nuovo link */}
          <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-black/10 p-2 dark:border-white/10">
            <Input
              value={newLinkName}
              onChange={(event) => setNewLinkName(event.target.value)}
              placeholder={t('editor.linkName')}
              className="w-32"
            />
            <Input
              value={newLinkUrl}
              onChange={(event) => setNewLinkUrl(event.target.value)}
              placeholder="https://…"
              className="min-w-40 flex-1 font-mono text-xs"
              onKeyDown={(event) => {
                if (event.key === 'Enter') void addLink();
              }}
            />
            <select
              value={newLinkKind}
              onChange={(event) => setNewLinkKind(event.target.value as LinkKind)}
              className="h-10 rounded-xl bg-black/[0.04] px-2 text-xs dark:bg-white/[0.05]"
            >
              {LINK_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {t(`editor.linkKinds.${kind}`)}
                </option>
              ))}
            </select>
            <Button size="icon" onClick={() => void addLink()} title={t('common.add')}>
              <Plus strokeWidth={2} className="size-4" />
            </Button>
          </div>
        </section>

        {/* --- Azioni distruttive, in fondo e separate --- */}
        <div className="flex items-center justify-between border-t border-black/5 pt-4 dark:border-white/[0.06]">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void duplicateApplication(
                application.id,
                `${application.name} ${t('common.copySuffix')}`,
              );
              onClose();
            }}
          >
            <Copy strokeWidth={1.75} className="size-3.5" />
            {t('common.duplicate')}
          </Button>
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                void deleteApplication(application.id);
                onClose();
              }}
            >
              <Trash2 strokeWidth={1.75} className="size-3.5" />
              {t('common.delete')}
            </Button>
            <Button size="sm" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
