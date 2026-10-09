// One-off migration: creates the post_targets table (per-platform publish
// tracking) on the existing live database. Safe to re-run.
//
// Run with: npx tsx --env-file=.env scripts/add-post-targets.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set in .env.');
}

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema', 'post_targets.sql'), 'utf8');
  await pool.query(sql);
  console.log('post_targets table is ready.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
