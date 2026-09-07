import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';

export interface PromptDialogProps {
  open: boolean;
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/**
 * Il dialogo "dammi un nome": creazione, rinomina, duplicazione.
 * Monta solo quando serve, così il valore iniziale non va mai risincronizzato.
 */
function PromptDialogContent({
  title,
  label,
  placeholder,
  initialValue = '',
  confirmLabel,
  onConfirm,
  onCancel,
}: Omit<PromptDialogProps, 'open'>) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialValue);

  // Il testo iniziale arriva già selezionato: rinominare è un gesto solo.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const input = document.getElementById('prompt-dialog-input') as HTMLInputElement | null;
      input?.select();
    }, 80);
    return () => window.clearTimeout(timer);
  }, []);

  const confirm = () => {
    const trimmed = value.trim();
    if (trimmed.length === 0) return;
    onConfirm(trimmed);
  };

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        {title}
      </h2>
      <Input
        id="prompt-dialog-input"
        autoFocus
        value={value}
        label={label}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') confirm();
        }}
      />
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button variant="accent" onClick={confirm} disabled={value.trim().length === 0}>
          {confirmLabel ?? t('common.save')}
        </Button>
      </div>
    </div>
  );
}

export function PromptDialog({ open, onCancel, ...props }: PromptDialogProps) {
  return (
    <Modal open={open} onClose={onCancel}>
      {open && <PromptDialogContent onCancel={onCancel} {...props} />}
    </Modal>
  );
}
