// One-off migration: adds the gemini_api_key column (bring-your-own-key) to
// the existing users table. Safe to re-run.
//
// Run with: npx tsx --env-file=.env scripts/add-gemini-key.ts
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set in .env.');
}

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;');
  console.log('users.gemini_api_key column is ready.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
