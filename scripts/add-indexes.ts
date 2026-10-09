// One-off migration: creates the indexes added to schema/*.sql for the
// existing live database (CREATE TABLE IF NOT EXISTS in those files won't
// retroactively add indexes to a table that already exists). Safe to re-run.
//
// Run with: npx tsx --env-file=.env scripts/add-indexes.ts
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set in .env.');
}

const pool = new Pool({ connectionString: databaseUrl });

const STATEMENTS = [
  'CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at DESC);',
  "CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);",
  'CREATE INDEX IF NOT EXISTS idx_customer_messages_user_created ON customer_messages(user_id, created_at DESC);',
  'CREATE INDEX IF NOT EXISTS idx_schedule_events_user ON schedule_events(user_id);',
  'CREATE INDEX IF NOT EXISTS idx_connected_accounts_platform_external ON connected_accounts(platform, external_id);',
];

async function main() {
  for (const sql of STATEMENTS) {
    await pool.query(sql);
    console.log('OK:', sql);
  }
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
