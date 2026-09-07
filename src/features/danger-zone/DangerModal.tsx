import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, TriangleAlert } from 'lucide-react';
import { Button, Input, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { fallbackPrompt, renderPrompt } from './prompt';
import type { OpenIntent } from '@/types/domain';

interface DangerModalProps {
  intent: OpenIntent | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Conferma di apertura per un singolo link protetto.
 *
 * Il livello `critical` richiede di digitare una parola: ESC è disabilitato e
 * il click fuori non chiude. Non è ostruzionismo, è l'unica barriera che
 * costringe a leggere che cosa si sta per aprire.
 */
export function DangerModal({ intent, onConfirm, onCancel }: DangerModalProps) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');

  const rendered = useMemo(() => {
    if (!intent) return null;
    return intent.prompt
      ? renderPrompt(intent.prompt, intent.placeholders, t)
      : fallbackPrompt(intent.danger.level, intent.placeholders, t);
  }, [intent, t]);

  if (!intent || !rendered) return null;

  const isCritical = intent.danger.level === 'critical';
  const requiredWord = rendered.confirmWord;
  const canConfirm = !isCritical || (!!requiredWord && typed.trim() === requiredWord);

  const close = () => {
    setTyped('');
    onCancel();
  };

  const confirm = () => {
    if (!canConfirm) return;
    setTyped('');
    onConfirm();
  };

  const Icon = isCritical ? ShieldAlert : TriangleAlert;
  const tone = intent.danger.level === 'warning' ? 'neutral' : 'danger';

  return (
    <Modal
      open
      onClose={close}
      tone={tone}
      dismissible={!isCritical}
      labelledBy="danger-modal-title"
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-start gap-4">
          <span
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-2xl',
              tone === 'danger' ? 'bg-red-500/15 text-red-500' : 'bg-orange-500/15 text-orange-500',
            )}
          >
            <Icon strokeWidth={1.75} className="size-5" />
          </span>

          <div className="flex min-w-0 flex-col gap-1.5">
            <h2
              id="danger-modal-title"
              className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              {rendered.title}
            </h2>
            <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
              {rendered.message}
            </p>
          </div>
        </div>

        {/* L'URL in chiaro: la verifica finale la fa sempre l'occhio umano. */}
        <div className="flex flex-col gap-2 rounded-2xl bg-black/[0.04] p-3 dark:bg-white/[0.04]">
          <span className="selectable font-mono text-xs break-all text-zinc-600 dark:text-zinc-300">
            {intent.url}
          </span>
          {intent.danger.inheritedFromName && !intent.danger.isOwn && (
            <span className="text-[0.6875rem] text-zinc-500 dark:text-zinc-500">
              {t('danger.inheritedFrom', { name: intent.danger.inheritedFromName })}
            </span>
          )}
        </div>

        {isCritical && requiredWord && (
          <Input
            autoFocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') confirm();
            }}
            label={t('danger.typeToConfirm', { word: requiredWord })}
            placeholder={requiredWord}
            className="font-mono tracking-wider uppercase"
          />
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={close}>
            {rendered.cancelLabel}
          </Button>
          <Button variant="danger" onClick={confirm} disabled={!canConfirm}>
            {rendered.confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
