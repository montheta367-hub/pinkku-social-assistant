import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const rows = await pool.query("SELECT * FROM orders ORDER BY created_at DESC");
  console.log('ORDERS:', JSON.stringify(rows.rows, null, 2));
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
