import { describe, expect, it } from 'vitest';
import type { PathInfo } from '@/types/generated/PathInfo';
import { actionsFor, primaryAction } from './registry';

const info = (kind: PathInfo['kind']): PathInfo => ({
  path: 'C:\\dev\\app',
  resolved: 'C:\\dev\\app',
  kind,
  isNetwork: false,
  sizeBytes: null,
  modifiedAt: null,
  extension: kind === 'file' ? 'pdf' : null,
  gitBranch: kind === 'repository' ? 'main' : null,
});

const path = { kind: 'path' as const, url: null, path: 'C:\\dev\\app' };

describe('actionsFor', () => {
  it('opens links and groups by default', () => {
    expect(primaryAction({ node: { kind: 'link', url: 'https://a.it', path: null } })?.id).toBe(
      'open',
    );
    expect(primaryAction({ node: { kind: 'link_group', url: null, path: null } })?.label).toBe(
      'openAll',
    );
  });

  it('picks the primary action from what the disk says', () => {
    expect(primaryAction({ node: path, pathInfo: info('repository') })).toMatchObject({
      id: 'open_with',
      tool: 'ide',
    });
    expect(primaryAction({ node: path, pathInfo: info('directory') })?.label).toBe('explorer');
    expect(primaryAction({ node: path, pathInfo: info('file') })?.label).toBe('open');
    expect(primaryAction({ node: path })?.label).toBe('explorer');
  });

  it('offers nothing that would fail on a missing path', () => {
    expect(actionsFor({ node: path, pathInfo: info('missing') }).map((a) => a.id)).toEqual([
      'copy',
    ]);
    expect(primaryAction({ node: path, pathInfo: info('unavailable') })).toBeUndefined();
  });

  it('keeps containers out of the registry', () => {
    expect(actionsFor({ node: { kind: 'project', url: null, path: null } })).toEqual([]);
  });

  it('has exactly one primary action per executable target', () => {
    for (const kind of ['file', 'directory', 'repository'] as const) {
      const primary = actionsFor({ node: path, pathInfo: info(kind) }).filter(
        (action) => action.weight === 'primary',
      );
      expect(primary).toHaveLength(1);
    }
  });
});
