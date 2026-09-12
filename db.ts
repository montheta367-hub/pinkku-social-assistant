// Thin Postgres data-access layer over Neon (via `pg`), replacing the
// previous @supabase/supabase-js client. Exposes just the handful of
// operations this codebase actually needs — plain SELECT/INSERT/UPDATE/
// UPSERT/DELETE with an equality-only WHERE — rather than a general query
// builder, since that's the full extent of what app.ts ever asked Supabase
// for.
import pg from 'pg';

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL must be set in .env (Neon Postgres connection string).');
}

export const pool = new Pool({ connectionString });

function quoteIdent(name: string): string {
  return `"${name}"`;
}

function whereClause(where: Record<string, any>, startIndex = 1): { text: string; values: any[] } {
  const keys = Object.keys(where);
  if (!keys.length) return { text: '', values: [] };
  const text = ' WHERE ' + keys.map((k, i) => `${quoteIdent(k)} = $${startIndex + i}`).join(' AND ');
  return { text, values: keys.map((k) => where[k]) };
}

export async function selectOne<T = any>(
  table: string,
  where: Record<string, any>,
  columns = '*'
): Promise<T | undefined> {
  const w = whereClause(where);
  const res = await pool.query(`SELECT ${columns} FROM ${quoteIdent(table)}${w.text} LIMIT 1`, w.values);
  return res.rows[0];
}

export async function selectMany<T = any>(
  table: string,
  where: Record<string, any> = {},
  opts: { columns?: string; orderBy?: string; ascending?: boolean } = {}
): Promise<T[]> {
  const w = whereClause(where);
  let text = `SELECT ${opts.columns ?? '*'} FROM ${quoteIdent(table)}${w.text}`;
  if (opts.orderBy) {
    text += ` ORDER BY ${quoteIdent(opts.orderBy)} ${opts.ascending === false ? 'DESC' : 'ASC'}`;
  }
  const res = await pool.query(text, w.values);
  return res.rows;
}

export async function insertRow<T = any>(
  table: string,
  row: Record<string, any>,
  returning = false
): Promise<T | undefined> {
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  let text = `INSERT INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(', ')}) VALUES (${placeholders.join(', ')})`;
  if (returning) text += ' RETURNING *';
  const res = await pool.query(
    text,
    cols.map((c) => row[c])
  );
  return returning ? res.rows[0] : undefined;
}

export async function updateRows(
  table: string,
  where: Record<string, any>,
  patch: Record<string, any>
): Promise<void> {
  const cols = Object.keys(patch);
  const setClause = cols.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(', ');
  const w = whereClause(where, cols.length + 1);
  await pool.query(`UPDATE ${quoteIdent(table)} SET ${setClause}${w.text}`, [...cols.map((c) => patch[c]), ...w.values]);
}

// INSERT ... ON CONFLICT (conflictCols) DO UPDATE — conflictCols must match
// an existing unique constraint or primary key on the table.
export async function upsertRow(table: string, row: Record<string, any>, conflictCols: string[]): Promise<void> {
  const cols = Object.keys(row);
  const placeholders = cols.map((_, i) => `$${i + 1}`);
  const updateSet = cols
    .filter((c) => !conflictCols.includes(c))
    .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
    .join(', ');
  const text = `INSERT INTO ${quoteIdent(table)} (${cols.map(quoteIdent).join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (${conflictCols
    .map(quoteIdent)
    .join(', ')}) DO UPDATE SET ${updateSet}`;
  await pool.query(
    text,
    cols.map((c) => row[c])
  );
}

export async function deleteRows(table: string, where: Record<string, any>): Promise<void> {
  const w = whereClause(where);
  await pool.query(`DELETE FROM ${quoteIdent(table)}${w.text}`, w.values);
}
