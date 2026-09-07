import type { ContainerKind } from '@/types/domain';

/**
 * Specchio lato UI delle regole in `allowed_child_kinds`.
 *
 * Serve solo a decidere quali pulsanti mostrare: la regola vera resta nel
 * database e viene applicata da Rust, che rifiuta comunque un annidamento
 * illegale anche se la UI provasse a proporlo.
 */
export const CHILD_KINDS: Record<ContainerKind | 'root', ContainerKind[]> = {
  root: ['project', 'workspace'],
  project: ['environment', 'group'],
  environment: ['context', 'group'],
  context: ['group'],
  workspace: ['group'],
  group: ['group'],
};

/** Emoji di ripiego, usata quando l'utente non ne ha scelta una. */
export const KIND_ICON: Record<ContainerKind, string> = {
  project: '\u{1F4C1}',
  workspace: '\u{1F9F0}',
  environment: '\u{1F310}',
  context: '\u{1F3E2}',
  group: '\u{1F4C2}',
};
