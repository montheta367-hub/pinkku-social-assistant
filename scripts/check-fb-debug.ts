import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
async function main() {
  const users = await pool.query("SELECT id, name, facebook_auto_reply FROM users");
  console.log('USERS:', JSON.stringify(users.rows, null, 2));
  const accounts = await pool.query("SELECT user_id, platform, external_id, account_name, connected_at FROM connected_accounts WHERE platform='facebook'");
  console.log('FB ACCOUNTS:', JSON.stringify(accounts.rows, null, 2));
  const msgs = await pool.query("SELECT * FROM customer_messages ORDER BY created_at DESC LIMIT 10");
  console.log('RECENT MESSAGES:', JSON.stringify(msgs.rows, null, 2));
  await pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });
