import app from '../app';

// vercel.json rewrites every /api/* request to this one function; Express's
// own routing inside `app` (app.get('/api/auth/login', ...), etc.) handles
// the rest, same as it does under `npm start`.
export default app;
