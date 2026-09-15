import { describe, expect, it } from 'vitest';
import { currentNodeId, parseNodeRoute, routeForChain, workspaceFromPath } from './routes';

describe('routeForChain', () => {
  it('costruisce l indirizzo lungo il percorso', () => {
    const chain = [
      { id: 'ws', kind: 'workspace' },
      { id: 'sh', kind: 'project' },
      { id: 'be', kind: 'subproject' },
      { id: 'prod', kind: 'section' },
      { id: 'db', kind: 'section' },
    ] as const;

    expect(routeForChain('ws', chain)).toBe('/w/ws/p/sh/s/be/n/db');
    expect(routeForChain('ws', chain.slice(0, 3))).toBe('/w/ws/p/sh/s/be');
    expect(routeForChain('ws', chain.slice(0, 1))).toBe('/w/ws');
  });

  it('segue il workspace di contesto, non quello del percorso', () => {
    const chain = [
      { id: 'lavoro', kind: 'workspace' },
      { id: 'sh', kind: 'project' },
    ] as const;
    expect(routeForChain('sviluppo', chain)).toBe('/w/sviluppo/p/sh');
  });

  it('una sezione direttamente nel workspace non ha progetto', () => {
    const chain = [
      { id: 'ws', kind: 'workspace' },
      { id: 'banche', kind: 'section' },
    ] as const;
    expect(routeForChain('ws', chain)).toBe('/w/ws/n/banche');
  });
});

describe('currentNodeId', () => {
  it('sceglie il segmento piu profondo', () => {
    expect(currentNodeId({ workspaceId: 'w', projectId: 'p', subprojectId: 's' })).toBe('s');
    expect(currentNodeId({ workspaceId: 'w', projectId: 'p', sectionId: 'n' })).toBe('n');
    expect(currentNodeId({ workspaceId: 'w' })).toBe('w');
    expect(currentNodeId({})).toBeUndefined();
  });
});

describe('workspaceFromPath', () => {
  it('estrae il workspace dall indirizzo', () => {
    expect(workspaceFromPath('/w/abc/p/def')).toBe('abc');
    expect(workspaceFromPath('/w/abc')).toBe('abc');
    expect(workspaceFromPath('/impostazioni')).toBeUndefined();
  });
});

describe('parseNodeRoute', () => {
  it('legge tutti i segmenti presenti', () => {
    expect(parseNodeRoute('/w/ws/p/sh/s/be/n/db')).toEqual({
      workspaceId: 'ws',
      projectId: 'sh',
      subprojectId: 'be',
      sectionId: 'db',
    });
    expect(parseNodeRoute('/w/ws/n/banche')).toEqual({ workspaceId: 'ws', sectionId: 'banche' });
  });

  it('le pagine del workspace hanno solo il workspace', () => {
    expect(parseNodeRoute('/w/ws/preferiti')).toEqual({ workspaceId: 'ws' });
    expect(parseNodeRoute('/impostazioni')).toEqual({});
  });

  it('e l inverso di routeForChain', () => {
    const route = routeForChain('ws', [
      { id: 'ws', kind: 'workspace' },
      { id: 'sh', kind: 'project' },
      { id: 'prod', kind: 'section' },
    ]);
    expect(currentNodeId(parseNodeRoute(route))).toBe('prod');
  });
});
