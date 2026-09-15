import { Tooltip as Primitive } from 'radix-ui';
import { Kbd } from './Kbd';

export const TooltipProvider = ({ children }: { children: React.ReactNode }) => (
  <Primitive.Provider delayDuration={450} skipDelayDuration={150}>
    {children}
  </Primitive.Provider>
);

interface TipProps {
  label: string;
  shortcut?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children: React.ReactElement;
}

/** Tooltip per i controlli che non dicono cosa fanno (icone, scorciatoie). */
export function Tip({ label, shortcut, side = 'bottom', children }: TipProps) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="bg-ink text-canvas shadow-2 z-50 flex items-center gap-2 rounded-sm px-2 py-1 text-xs data-[state=delayed-open]:animate-[fade-in_120ms_ease-out]"
        >
          {label}
          {shortcut && <Kbd tone="inverse">{shortcut}</Kbd>}
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
