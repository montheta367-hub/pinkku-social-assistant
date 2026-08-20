import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Port 5173 (Vite's default), deliberately NOT 3000 — the Express server in
  // server.ts owns port 3000 (serves the built app + API together via `npm start`).
  // Keeping these different means an accidental `npm run dev` can never collide
  // with the real server, even though both used to target the same port.
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
    // Forwards API calls to the real Express+Supabase server on 3000, so
    // login/Gmail/TikTok connect etc. also work when running `npm run dev`,
    // not just on the `npm start` build.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  }
});
