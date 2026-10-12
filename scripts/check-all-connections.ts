import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const accounts = await pool.query("SELECT user_id, platform, external_id, account_name, connected_at FROM connected_accounts ORDER BY connected_at DESC");
  console.log('ALL CONNECTED ACCOUNTS:', JSON.stringify(accounts.rows, null, 2));
  const users = await pool.query("SELECT id, name, email, telegram_channel_id FROM users");
  console.log('USERS:', JSON.stringify(users.rows, null, 2));
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
