// One-off migration: creates the orders table (see schema/orders.sql).
// Safe to re-run.
//
// Run with: npx tsx --env-file=.env scripts/add-orders.ts
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set in .env.');
}

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      customer_chat_id TEXT,
      customer_name TEXT,
      phone TEXT,
      address TEXT,
      product_note TEXT,
      source_message TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      created_at TEXT NOT NULL
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);');
  console.log('orders table is ready.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
