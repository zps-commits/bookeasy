/**
 * Loads db/seed.sql. Every row in it is invented demonstration data.
 *
 *   npm run db:seed
 *
 * The file uses `on conflict do nothing`, so running it twice adds
 * nothing and overwrites nothing.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Pool } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) {
  console.error('DATABASE_URL is not set. Run `neon env pull` first.');
  process.exit(1);
}

const pool = new Pool({ connectionString });
try {
  const sql = await readFile(path.join(process.cwd(), 'db', 'seed.sql'), 'utf8');
  await pool.query(sql);
  const { rows } = await pool.query(
    'select (select count(*) from services) as services, (select count(*) from professionals) as professionals, (select count(*) from business_hours) as hours',
  );
  console.log('seeded:', rows[0]);
} finally {
  await pool.end();
}
