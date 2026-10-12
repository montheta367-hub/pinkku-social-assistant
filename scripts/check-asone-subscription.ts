import pg from 'pg';
import { createHash, createDecipheriv } from 'node:crypto';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY
  ? createHash('sha256').update(process.env.TOKEN_ENCRYPTION_KEY).digest()
  : null;
const ENCRYPTED_PREFIX = 'enc:v1:';

function decryptSecret(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined || !value.startsWith(ENCRYPTED_PREFIX)) return value;
  if (!TOKEN_ENCRYPTION_KEY) throw new Error('No TOKEN_ENCRYPTION_KEY set');
  const raw = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', TOKEN_ENCRYPTION_KEY, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

async function main() {
  const res = await pool.query(
    "SELECT user_id, external_id, access_token FROM connected_accounts WHERE platform='facebook' AND external_id='1231385310063432'"
  );
  const row = res.rows[0];
  const token = decryptSecret(row.access_token);
  console.log('Token prefix:', token?.slice(0, 15), 'length:', token?.length);

  const subRes = await fetch(`https://graph.facebook.com/v21.0/${row.external_id}/subscribed_apps?access_token=${encodeURIComponent(token!)}`);
  const subData = await subRes.json();
  console.log('Asone subscribed_apps:', JSON.stringify(subData, null, 2));

  // Also check what app this token actually belongs to
  const debugRes = await fetch(`https://graph.facebook.com/v21.0/me?fields=id,name&access_token=${encodeURIComponent(token!)}`);
  console.log('Token identity:', JSON.stringify(await debugRes.json(), null, 2));

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
