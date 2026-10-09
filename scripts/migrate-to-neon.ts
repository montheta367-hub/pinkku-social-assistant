// One-off migration: applies every table definition under schema/*.sql to
// the new Neon database, then copies every row over from the old Supabase
// project so no existing user/account/post is lost. Safe to re-run — inserts
// are skipped (ON CONFLICT DO NOTHING) if a row with the same primary key
// already exists.
//
// Run with: npx tsx --env-file=.env scripts/migrate-to-neon.ts
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env (source database).');
}
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set in .env (destination Neon database).');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const neon = new Pool({ connectionString: databaseUrl });

// Order matters only for readability here — every FK in this schema is a
// plain TEXT column with no actual REFERENCES constraint, so insert order
// doesn't need to respect dependencies, but we keep it logical anyway.
const TABLES = [
  'users',
  'sessions',
  'oauth_states',
  'connected_accounts',
  'schedule_events',
  'telegram_contacts',
  'telegram_groups',
  'customer_messages',
  'posts',
  'post_targets',
  'faq_entries',
];

async function applySchema() {
  console.log('Applying schema to Neon...');
  for (const table of TABLES) {
    const filePath = path.join(__dirname, '..', 'schema', `${table}.sql`);
    const sql = fs.readFileSync(filePath, 'utf8');
    await neon.query(sql);
  }
  console.log('Schema applied.\n');
}

async function copyTable(table: string) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw new Error(`Reading ${table} from Supabase failed: ${error.message}`);
  const rows = data || [];
  if (rows.length === 0) {
    console.log(`${table}: 0 rows (nothing to copy)`);
    return;
  }

  let copied = 0;
  for (const row of rows) {
    const cols = Object.keys(row);
    const placeholders = cols.map((_, i) => `$${i + 1}`);
    const text = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${placeholders.join(
      ', '
    )}) ON CONFLICT DO NOTHING`;
    await neon.query(
      text,
      cols.map((c) => row[c])
    );
    copied += 1;
  }
  console.log(`${table}: ${copied} rows copied`);
}

async function main() {
  await applySchema();
  for (const table of TABLES) {
    await copyTable(table);
  }
  console.log('\nMigration complete.');
  await neon.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
