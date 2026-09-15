import { describe, expect, it } from 'vitest';
import { canNestUnder, pickPosition, planMove } from './treeDrop';
import type { Container, ContainerKind } from '@/types/domain';

let order = 0;
const node = (id: string, kind: ContainerKind, parentId: string | null = null): Container => ({
  id,
  profileId: 'p',
  parentId,
  kind,
  name: id,
  slug: null,
  description: null,
  icon: null,
  color: null,
  badgeText: null,
  backgroundId: null,
  dangerLevel: null,
  dangerPromptId: null,
  isFavorite: false,
  isArchived: false,
  sortOrder: (order += 1000),
});

/**
 * ACME > PROD > Cliente A
 *      > TEST
 *      > Docs (gruppo)
 * BETA
 * Strumenti (workspace)
 */
const tree = [
  node('acme', 'project'),
  node('beta', 'project'),
  node('tools', 'workspace'),
  node('prod', 'environment', 'acme'),
  node('test', 'environment', 'acme'),
  node('docs', 'group', 'acme'),
  node('cli', 'context', 'prod'),
];
const get = (id: string) => tree.find((n) => n.id === id)!;

describe('canNestUnder', () => {
  it('follows the nesting rules', () => {
    expect(canNestUnder(tree, get('prod'), 'beta')).toBe(true);
    expect(canNestUnder(tree, get('prod'), null)).toBe(false);
    expect(canNestUnder(tree, get('prod'), 'test')).toBe(false);
    expect(canNestUnder(tree, get('docs'), 'tools')).toBe(true);
    expect(canNestUnder(tree, get('cli'), 'beta')).toBe(false);
  });

  it('refuses cycles', () => {
    expect(canNestUnder(tree, get('docs'), 'docs')).toBe(false);
    const nested = [...tree, node('sub', 'group', 'docs')];
    expect(canNestUnder(nested, get('docs'), 'sub')).toBe(false);
  });
});

describe('pickPosition', () => {
  it('splits the row in three bands when everything is allowed', () => {
    expect(pickPosition(0.1, true, true)).toBe('before');
    expect(pickPosition(0.5, true, true)).toBe('inside');
    expect(pickPosition(0.9, true, true)).toBe('after');
  });

  it('gives the whole row to what is allowed', () => {
    expect(pickPosition(0.1, true, false)).toBe('inside');
    expect(pickPosition(0.4, false, true)).toBe('before');
    expect(pickPosition(0.6, false, true)).toBe('after');
    expect(pickPosition(0.5, false, false)).toBeNull();
  });
});

describe('planMove', () => {
  it('reorders among siblings', () => {
    expect(planMove(tree, 'test', { id: 'prod', position: 'before' })).toEqual({
      parentId: 'acme',
      previousId: null,
      nextId: 'prod',
    });
    expect(planMove(tree, 'prod', { id: 'docs', position: 'after' })).toEqual({
      parentId: 'acme',
      previousId: 'docs',
      nextId: null,
    });
  });

  it('appends at the end when dropped inside', () => {
    expect(planMove(tree, 'docs', { id: 'prod', position: 'inside' })).toEqual({
      parentId: 'prod',
      previousId: 'cli',
      nextId: null,
    });
    expect(planMove(tree, 'prod', { id: 'beta', position: 'inside' })).toEqual({
      parentId: 'beta',
      previousId: null,
      nextId: null,
    });
  });

  it('ignores drops that change nothing', () => {
    expect(planMove(tree, 'test', { id: 'prod', position: 'after' })).toBeNull();
    expect(planMove(tree, 'test', { id: 'docs', position: 'before' })).toBeNull();
    expect(planMove(tree, 'docs', { id: 'acme', position: 'inside' })).toBeNull();
    expect(planMove(tree, 'prod', { id: 'prod', position: 'inside' })).toBeNull();
  });

  it('refuses illegal drops', () => {
    // Un ambiente in radice, un contesto in un progetto, un nodo nel suo ramo.
    expect(planMove(tree, 'prod', { id: 'beta', position: 'after' })).toBeNull();
    expect(planMove(tree, 'cli', { id: 'test', position: 'after' })).toBeNull();
    expect(planMove(tree, 'acme', { id: 'cli', position: 'inside' })).toBeNull();
  });

  it('keeps projects and workspaces in their own tree', () => {
    expect(planMove(tree, 'beta', { id: 'tools', position: 'after' })).toBeNull();
    expect(planMove(tree, 'beta', { id: 'acme', position: 'before' })).toEqual({
      parentId: null,
      previousId: null,
      nextId: 'acme',
    });
  });
});
