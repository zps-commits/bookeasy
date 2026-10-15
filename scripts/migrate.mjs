/**
 * Applies the SQL migrations in db/migrations, in filename order, once each.
 *
 *   npm run db:migrate          apply anything not yet applied
 *   npm run db:migrate -- --dry show what would run and stop
 *
 * Applied migrations are recorded in schema_migrations, so a second run is
 * a no-op rather than a re-execution. Each file runs inside a transaction:
 * a migration that fails half way leaves nothing behind.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from '@neondatabase/serverless';

const DIR = path.join(process.cwd(), 'db', 'migrations');
const dryRun = process.argv.includes('--dry');

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error('DATABASE_URL is not set. Run `neon env pull` first.');
  process.exit(1);
}

const pool = new Pool({ connectionString });

try {
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const applied = new Set(
    (await pool.query('select filename from schema_migrations')).rows.map((r) => r.filename),
  );

  const files = (await readdir(DIR)).filter((f) => f.endsWith('.sql')).sort();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log(`Nothing to apply. ${files.length} migration(s) already recorded.`);
    process.exit(0);
  }

  console.log(`Pending: ${pending.join(', ')}`);
  if (dryRun) process.exit(0);

  for (const file of pending) {
    const sql = await readFile(path.join(DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (filename) values ($1)', [file]);
      await client.query('commit');
      console.log(`applied ${file}`);
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      console.error(`FAILED ${file}: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
      break;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
