// One-off migration: adds the media_url column to the existing posts table
// so a post's attached photo/video survives past the browser session and
// can be auto-published to Facebook alongside its caption.
//
// Run with: npx tsx --env-file=.env scripts/add-posts-media-url.ts
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set in .env.');
}

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  await pool.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS media_url TEXT;');
  console.log('posts.media_url column is ready.');
  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
