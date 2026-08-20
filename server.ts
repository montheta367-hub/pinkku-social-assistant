import app from './app.ts';

// Local dev / `npm start` entry point — starts the persistent server.
// On Vercel, api/[...all].ts imports the same `app` and exports it directly
// as a serverless function instead (no .listen(), no persistent process).
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Pinkku Social Assistant server running on port ${PORT}`);
});
