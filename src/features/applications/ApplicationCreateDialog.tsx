import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2 } from 'lucide-react';
import { Button, Input, Modal } from '@/components/ui';
import { useDataStore } from '@/stores/dataStore';

interface ApplicationCreateDialogProps {
  open: boolean;
  containerId: string;
  onClose: () => void;
}

/**
 * Creazione di un'applicazione: nome **e primo URL** nello stesso passo.
 *
 * Chiedere solo il nome produceva applicazioni senza link — che cliccate non
 * fanno niente, perché non c'è niente da aprire. L'URL resta facoltativo (si
 * può creare un contenitore vuoto da riempire dopo), ma va chiesto qui:
 * è il gesto per cui esiste l'applicazione.
 */
export function ApplicationCreateDialog({
  open,
  containerId,
  onClose,
}: ApplicationCreateDialogProps) {
  const { t } = useTranslation();
  const createApplication = useDataStore((state) => state.createApplication);
  const createLink = useDataStore((state) => state.createLink);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName('');
    setUrl('');
  };

  const close = () => {
    reset();
    onClose();
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    setBusy(true);
    try {
      const created = await createApplication(containerId, trimmedName);
      if (created && url.trim()) {
        // Il primo link prende il nome dell'applicazione: "Camunda" apre
        // "Camunda". Gli altri si aggiungono dall'editor con nomi propri.
        await createLink(created.id, trimmedName, url.trim());
      }
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} labelledBy="create-application-title">
      {open && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2
              id="create-application-title"
              className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              {t('navigator.addApplication')}
            </h2>
            <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {t('applications.createHint')}
            </p>
          </div>

          <Input
            autoFocus
            label={t('editor.name')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Camunda"
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save();
            }}
          />

          <Input
            label={t('applications.firstLink')}
            hint={t('applications.firstLinkHint')}
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://…"
            className="font-mono text-xs"
            leading={<Link2 strokeWidth={1.75} className="size-4" />}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save();
            }}
          />

          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={close}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="accent"
              onClick={() => void save()}
              disabled={name.trim().length === 0}
              isLoading={busy}
            >
              {t('common.add')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
