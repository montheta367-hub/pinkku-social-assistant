import app, { publishDuePosts } from './app.js';

// Local dev / `npm start` entry point — starts the persistent server.
// On Vercel, api/[...all].ts imports the same `app` and exports it directly
// as a serverless function instead (no .listen(), no persistent process).
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Pinkku Social Assistant server running on port ${PORT}`);
});

// Auto-publishes posts once their scheduled time arrives. Only runs here,
// under this persistent process — the Vercel serverless deploy has no
// background timer, so scheduled posts there still need a manual "Publish
// Now" click or a separate Vercel Cron job.
setInterval(() => {
  publishDuePosts();
}, 60_000);
