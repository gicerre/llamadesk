/**
 * Verifica che ogni istruzione SQL scritta nel backend Rust sia valida.
 *
 * Estrae le stringhe SQL dai sorgenti `src-tauri/src/**.rs`, applica lo schema
 * reale (tutte le migrazioni, in ordine) su un SQLite in memoria e prova a preparare ogni
 * query: un errore di sintassi o una colonna inesistente fanno fallire qui,
 * invece che al primo avvio dell'applicazione.
 *
 * Uso: node scripts/check-sql.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import initSqlJs from 'sql.js';

const RUST_ROOT = 'src-tauri/src';
const MIGRATIONS = 'src-tauri/src/db/migrations';

function rustFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return rustFiles(path);
    return path.endsWith('.rs') ? [path] : [];
  });
}

/** Estrae le stringhe letterali che contengono SQL. */
function extractQueries(path) {
  const source = readFileSync(path, 'utf8');
  const literals = source.match(/"(?:[^"\\]|\\.)*"/gs) ?? [];

  return (
    literals
      .map((literal) => literal.slice(1, -1))
      .filter((sql) => /\b(SELECT|INSERT INTO|UPDATE|DELETE FROM|WITH RECURSIVE)\b/i.test(sql))
      // Le query costruite con `format!` contengono segnaposto: sono verificate
      // dai test Rust di `ordering`, non qui.
      .filter((sql) => !sql.includes('{'))
      // Le fixture dei test creano tabelle proprie (per esempio un database
      // legacy da migrare): non sono query dell'applicazione.
      .filter((sql) => !/\bCREATE TABLE\b/i.test(sql))
      .map((sql) => ({ path, sql: sql.replace(/\\n/g, '\n').replace(/\\"/g, '"') }))
  );
}

const SQL = await initSqlJs();
const db = new SQL.Database();
db.run('PRAGMA foreign_keys = ON;');
// Stesso ordine del migratore: il prefisso numerico del nome file.
for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
  db.run(readFileSync(join(MIGRATIONS, file), 'utf8'));
}

const queries = rustFiles(RUST_ROOT).flatMap(extractQueries);
const failures = [];

for (const { path, sql } of queries) {
  try {
    const statement = db.prepare(sql);
    statement.free();
  } catch (error) {
    failures.push({ path, sql, message: error.message });
  }
}

console.log(`Query analizzate: ${queries.length}`);

if (process.argv.includes('--verbose')) {
  const perFile = new Map();
  for (const { path } of queries) perFile.set(path, (perFile.get(path) ?? 0) + 1);
  for (const [path, count] of [...perFile].sort())
    console.log(`  ${count.toString().padStart(3)}  ${path}`);
  const recursive = queries.filter((q) => /WITH RECURSIVE/i.test(q.sql)).length;
  console.log(`  di cui CTE ricorsive: ${recursive}`);
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`\n✗ ${failure.path}\n  ${failure.message}\n  ${failure.sql.slice(0, 220)}`);
  }
  console.error(`\n${failures.length} query non valide.`);
  process.exit(1);
}

console.log('Tutte le query sono valide sullo schema corrente.');
