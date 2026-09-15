import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  hueForUrl,
  looksLikePath,
  monogramForUrl,
  nameForPath,
  nameForUrl,
  normalizeUrl,
  parseAddInput,
  shortenPath,
} from './resources';

describe('parseAddInput', () => {
  it('un indirizzo e un link', () => {
    expect(parseAddInput('https://specialhub.atlassian.net/wiki')).toEqual({
      kind: 'link',
      url: 'https://specialhub.atlassian.net/wiki',
      name: 'Specialhub · wiki',
    });
  });

  it('piu indirizzi sono un gruppo, righe vuote ignorate', () => {
    const intent = parseAddInput('https://github.com/specialhub\n\n jira.example.com/board \n');
    expect(intent.kind).toBe('link_group');
    if (intent.kind !== 'link_group') return;
    expect(intent.links.map((link) => link.url)).toEqual([
      'https://github.com/specialhub',
      'https://jira.example.com/board',
    ]);
  });

  it('percorsi Windows, di rete e con variabili sono percorsi', () => {
    const intent = parseAddInput(
      'C:\\dev\\specialhub\\backend\n"\\\\nas\\processi\\bpmn"\n%USERPROFILE%\\Documents',
    );
    expect(intent).toEqual({
      kind: 'path',
      paths: [
        { path: 'C:\\dev\\specialhub\\backend', name: 'backend' },
        { path: '\\\\nas\\processi\\bpmn', name: 'bpmn' },
        { path: '%USERPROFILE%\\Documents', name: 'Documents' },
      ],
    });
  });

  it('testo misto o semplice e un nome', () => {
    expect(parseAddInput('Documentazione')).toEqual({ kind: 'name', name: 'Documentazione' });
    expect(parseAddInput('https://a.example.com\nC:\\dev').kind).toBe('name');
    expect(parseAddInput('   ')).toEqual({ kind: 'empty' });
  });
});

describe('riconoscimento', () => {
  it('normalizza gli indirizzi senza schema e rifiuta il resto', () => {
    expect(normalizeUrl('grafana.dev.specialhub.it:3000/d/abc')).toBe(
      'https://grafana.dev.specialhub.it:3000/d/abc',
    );
    expect(normalizeUrl('mailto:team@example.com')).toBe('mailto:team@example.com');
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('Documentazione')).toBeNull();
    expect(normalizeUrl('file.txt')).toBeNull();
  });

  it('distingue i percorsi', () => {
    expect(looksLikePath('D:/progetti')).toBe(true);
    expect(looksLikePath('~/dev')).toBe(true);
    expect(looksLikePath('dev/specialhub')).toBe(false);
  });

  it('propone nomi leggibili', () => {
    expect(nameForUrl('https://www.github.com/')).toBe('Github');
    expect(nameForUrl('mailto:team@example.com')).toBe('team@example.com');
    expect(nameForPath('C:\\dev\\Architettura v3.pdf')).toBe('Architettura v3.pdf');
  });
});

describe('presentazione', () => {
  it('stesso dominio, stessa tinta e stesso monogramma', () => {
    expect(hueForUrl('https://jira.example.com/a')).toBe(
      hueForUrl('https://www.jira.example.com/b'),
    );
    expect(monogramForUrl('https://confluence.example.com', 'Wiki')).toBe('C');
    expect(monogramForUrl('non valido', 'wiki')).toBe('W');
  });

  it('formatta le dimensioni', () => {
    expect(formatBytes(512, 'it')).toBe('512 B');
    expect(formatBytes(2.4 * 1024 * 1024, 'it')).toBe('2,4 MB');
    expect(formatBytes(2.4 * 1024 * 1024, 'en')).toBe('2.4 MB');
  });

  it('accorcia i percorsi lunghi nel mezzo', () => {
    const path = 'C:\\Users\\gcerr\\Desktop\\Personale\\personal_projects\\LlamaDesk\\src';
    const short = shortenPath(path, 40);
    expect(short.length).toBeLessThanOrEqual(40);
    expect(short.startsWith('C:\\Users\\…')).toBe(true);
    expect(short.endsWith('\\src')).toBe(true);
    expect(shortenPath('C:\\dev')).toBe('C:\\dev');
  });
});
