import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const rows = await pool.query("SELECT * FROM telegram_contacts ORDER BY created_at DESC");
  console.log('TELEGRAM_CONTACTS:', JSON.stringify(rows.rows, null, 2));
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
