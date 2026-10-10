// One-off migration: adds the telegram_channel_id column (the business's own
// broadcast channel, e.g. "@shopname" or a numeric chat id, for auto-publish)
// to the existing users table. Safe to re-run.
//
// Run with: npx tsx --env-file=.env scripts/add-telegram-channel.ts
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set in .env.');
}

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_channel_id TEXT;');
  console.log('users.telegram_channel_id column is ready.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
