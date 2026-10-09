import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { GoogleGenAI } from '@google/genai';
import { OAuth2Client } from 'google-auth-library';
import { Resend } from 'resend';
import { selectOne, selectMany, insertRow, updateRows, upsertRow, deleteRows } from './db.js';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Several routes below do `if (error) throw error` inside an async handler
// without a try/catch. Without this, any single failed Supabase query (e.g. a
// missing table) crashes the entire process for every connected user.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

// Locked down to known frontend origins instead of allowing any website to
// call this API. Set ALLOWED_ORIGINS in .env (comma-separated) once you know
// your real production domain — defaults cover local dev only.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // No Origin header means a same-origin browser request, curl, or a
    // server-to-server call (e.g. Telegram/Facebook webhooks) — always allow.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
}));
// Default 100kb limit is too small for a post's attached photo, which rides
// along as a base64 data: URL in the JSON body (see parseDataUrl above).
app.use(express.json({ limit: '15mb' }));

// ---------------------------------------------------------------------------
// Database (Neon Postgres — schema lives in schema/*.sql, one file per
// table, applied via the Neon SQL Editor or scripts/migrate-to-neon.ts;
// db.ts talks to it directly over `pg`)
// ---------------------------------------------------------------------------

// Verifies the ID token Google's Identity Services library hands back in the
// browser, so "Sign in with Google" can never be spoofed by just POSTing an
// arbitrary email (see /api/auth/google below).
const googleOAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Slows down credential-stuffing / brute-force attempts against real
// password login. Note: this is an in-memory counter, so on Vercel's
// serverless runtime it only protects within a single warm instance, not
// globally — good enough as a first line of defense, not a hard guarantee.
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait a few minutes and try again.' },
});

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const derived = scryptSync(password, salt, 64);
  const keyBuffer = Buffer.from(key, 'hex');
  return derived.length === keyBuffer.length && timingSafeEqual(derived, keyBuffer);
}

// Used by /api/auth/login when the email doesn't match any account, so a
// non-existent email still pays the same scrypt cost as a real one — without
// this, an attacker could tell registered emails apart from unregistered
// ones just by how fast the response comes back, even though both get the
// same "Invalid email or password" message.
const DUMMY_PASSWORD_HASH = hashPassword(randomUUID());

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;
  business_name: string | null;
  business_type: string | null;
  avatar: string | null;
  tier: string;
  created_at: string;
}

async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return selectOne<UserRow>('users', { email });
}

async function insertUser(row: {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  businessName: string;
  businessType: string;
  avatar: string | null;
  tier: string;
}): Promise<UserRow> {
  const createdAt = new Date().toISOString();
  return (await insertRow<UserRow>('users', {
    id: row.id,
    name: row.name,
    email: row.email,
    password_hash: row.passwordHash,
    business_name: row.businessName,
    business_type: row.businessType,
    avatar: row.avatar,
    tier: row.tier,
    created_at: createdAt,
  }, true))!;
}

function toPublicUser(row: UserRow) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    businessName: row.business_name,
    businessType: row.business_type,
    avatar: row.avatar || undefined,
    isLoggedIn: true,
    tier: row.tier,
  };
}

// ---------------------------------------------------------------------------
// Sessions (Bearer tokens backing localStorage's "pinkku_token")
// ---------------------------------------------------------------------------
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

async function createSession(userId: string): Promise<string> {
  const token = 'sess_' + randomUUID();
  const now = new Date();
  await insertRow('sessions', {
    token,
    user_id: userId,
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString(),
  });
  return token;
}

async function getUserBySessionToken(token: string): Promise<UserRow | undefined> {
  const session = await selectOne<{ user_id: string; expires_at: string | null }>('sessions', { token }, 'user_id, expires_at');
  if (!session) return undefined;
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
    await deleteRows('sessions', { token });
    return undefined;
  }
  return selectOne<UserRow>('users', { id: session.user_id });
}

interface AuthedRequest extends express.Request {
  user?: UserRow;
}

async function requireAuth(req: AuthedRequest, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
  const user = await getUserBySessionToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  req.user = user;
  next();
}

// ---------------------------------------------------------------------------
// Small shared helpers for the oauth_states / connected_accounts tables,
// used by every platform's connect flow below.
// ---------------------------------------------------------------------------
async function createOAuthState(userId: string, platform: string, extra?: string): Promise<string> {
  const state = randomUUID();
  await insertRow('oauth_states', {
    state, user_id: userId, platform, extra: extra ?? null, created_at: new Date().toISOString(),
  });
  return state;
}

// Looks up a state (optionally scoped to a platform) and deletes it — states are one-time use.
async function consumeOAuthState(state: string, platform?: string): Promise<{ user_id: string; extra: string | null } | undefined> {
  const where: Record<string, any> = { state };
  if (platform) where.platform = platform;
  const data = await selectOne<{ user_id: string; extra: string | null }>('oauth_states', where);
  if (!data) return undefined;
  await deleteRows('oauth_states', { state });
  return data;
}

// Encrypts access_token/refresh_token at rest (AES-256-GCM) so a database
// leak alone doesn't hand over a working Facebook Page / Gmail / TikTok
// token. Optional: without TOKEN_ENCRYPTION_KEY set, tokens are stored as
// plaintext exactly like before — this only hardens deployments that opt in.
// Any 32-byte key works; TOKEN_ENCRYPTION_KEY is hashed with SHA-256 first so
// a plain passphrase of any length is fine too.
const TOKEN_ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY
  ? createHash('sha256').update(process.env.TOKEN_ENCRYPTION_KEY).digest()
  : null;
const ENCRYPTED_PREFIX = 'enc:v1:';

function encryptSecret(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined || !TOKEN_ENCRYPTION_KEY) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', TOKEN_ENCRYPTION_KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ENCRYPTED_PREFIX + Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

function decryptSecret(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined || !value.startsWith(ENCRYPTED_PREFIX)) return value;
  if (!TOKEN_ENCRYPTION_KEY) {
    console.error('[security] Found an encrypted token but TOKEN_ENCRYPTION_KEY is not set — cannot decrypt.');
    return null;
  }
  try {
    const raw = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', TOKEN_ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (err) {
    console.error('[security] Failed to decrypt a stored token:', err);
    return null;
  }
}

// connected_accounts is the only table holding real third-party secrets
// (access_token/refresh_token) — every read and write of it funnels through
// these three helpers so encryption stays consistent no matter which
// platform's connect flow is calling.
function encryptAccountSecrets(row: Record<string, any>): Record<string, any> {
  const out = { ...row };
  if ('access_token' in out) out.access_token = encryptSecret(out.access_token);
  if ('refresh_token' in out) out.refresh_token = encryptSecret(out.refresh_token);
  return out;
}

function decryptAccountRow<T extends { access_token?: string | null; refresh_token?: string | null }>(
  row: T | undefined
): T | undefined {
  if (!row) return row;
  if ('access_token' in row) (row as any).access_token = decryptSecret(row.access_token);
  if ('refresh_token' in row) (row as any).refresh_token = decryptSecret(row.refresh_token);
  return row;
}

async function upsertConnectedAccount(row: Record<string, any>): Promise<void> {
  await upsertRow('connected_accounts', encryptAccountSecrets(row), ['user_id', 'platform']);
}

async function getConnectedAccount(userId: string, platform: string): Promise<ConnectedAccountRow | undefined> {
  const row = await selectOne<ConnectedAccountRow>('connected_accounts', { user_id: userId, platform });
  return decryptAccountRow(row);
}

// Incoming platform webhooks (e.g. a Facebook Messenger event) key off the
// page/account id Meta sends, not off our own user_id — see the idx on
// (platform, external_id) in schema/connected_accounts.sql.
async function getConnectedAccountByExternalId(platform: string, externalId: string): Promise<ConnectedAccountRow | undefined> {
  const row = await selectOne<ConnectedAccountRow>('connected_accounts', { platform, external_id: externalId });
  return decryptAccountRow(row);
}

async function updateConnectedAccount(userId: string, platform: string, patch: Record<string, any>): Promise<void> {
  await updateRows('connected_accounts', { user_id: userId, platform }, encryptAccountSecrets(patch));
}

// ---------------------------------------------------------------------------
// Email (Resend)
// ---------------------------------------------------------------------------
let resendClient: Resend | null = null;
function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

async function sendWelcomeEmail(toEmail: string, name: string): Promise<boolean> {
  const resend = getResend();
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Pinkku <onboarding@resend.dev>';

  if (!resend) {
    console.warn(`[email] RESEND_API_KEY not set — skipping welcome email to ${toEmail}`);
    return false;
  }

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: toEmail,
      subject: "You're connected with Pinkku 🌸",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1e293b;">
          <div style="background: linear-gradient(135deg, #ec4899, #ff2d85); padding: 28px; border-radius: 20px; text-align: center; color: white;">
            <div style="font-size: 32px;">🌸</div>
            <h1 style="margin: 8px 0 0; font-size: 20px;">Welcome to Pinkku, ${name}!</h1>
          </div>
          <div style="padding: 24px 4px;">
            <p>Hi ${name},</p>
            <p>Your Pinkku account is now connected to <strong>${toEmail}</strong>. You're all set to link Facebook, Instagram, TikTok, Telegram and Gmail into one AI-powered workspace.</p>
            <p>Head back to your dashboard to connect your first channel and start generating content.</p>
            <p style="margin-top: 24px;">— The Pinkku Team</p>
          </div>
        </div>
      `,
    });

    if (error) {
      console.error('[email] Resend error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[email] Failed to send welcome email:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Lazy-init Gemini Client
// ---------------------------------------------------------------------------
let geminiClient: GoogleGenAI | null = null;
// Pass a user's own key (see resolveGeminiApiKey below) to get a one-off
// client for that call instead of the shared cached one — the shared
// instance stays pinned to the server's own GEMINI_API_KEY since different
// users can have different keys from call to call.
function getGemini(apiKey?: string): GoogleGenAI {
  if (apiKey) return new GoogleGenAI({ apiKey });
  if (!geminiClient) {
    const envKey = process.env.GEMINI_API_KEY;
    if (!envKey) {
      console.warn("GEMINI_API_KEY is not set in environment.");
    }
    geminiClient = new GoogleGenAI({ apiKey: envKey || '' });
  }
  return geminiClient;
}

// Bring-your-own-key: a user who set their own Gemini key in Settings uses
// it (and their own quota/billing) for every AI feature instead of the
// shared server key — important once more than one business signs up, so
// one account's usage can't drain the app owner's own API budget.
async function getUserGeminiKey(userId: string): Promise<string | undefined> {
  const row = await selectOne<{ gemini_api_key: string | null }>('users', { id: userId }, 'gemini_api_key');
  const decrypted = decryptSecret(row?.gemini_api_key ?? null);
  return decrypted || undefined;
}

async function resolveGeminiApiKey(userId?: string | null): Promise<string | undefined> {
  if (userId) {
    const userKey = await getUserGeminiKey(userId);
    if (userKey) return userKey;
  }
  return process.env.GEMINI_API_KEY || undefined;
}

// Gemini's free tier has a low requests-per-minute cap, and this app fires
// several calls in quick succession (inbox triage, per-page analysis, reply
// drafting). Without a retry, a transient 429 makes email importance fall
// back to "normal" for everything and leaves the AI draft box empty — retry
// with backoff so a single rate-limit blip doesn't wipe out real results.
async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: Parameters<GoogleGenAI['models']['generateContent']>[0],
  retries = 3
): Promise<Awaited<ReturnType<GoogleGenAI['models']['generateContent']>>> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err: any) {
      const message = String(err?.message || err);
      const isRateLimit = err?.status === 429 || /429|RESOURCE_EXHAUSTED|rate limit/i.test(message);
      if (isRateLimit && attempt < retries) {
        await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Authentication Endpoints
// ---------------------------------------------------------------------------
app.post('/api/auth/register', loginRateLimiter, async (req, res) => {
  const { name, email, password, businessName, businessType } = req.body;

  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  if (!password || String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists. Please log in instead.' });
  }

  const displayName = (name && String(name).trim()) || normalizedEmail.split('@')[0];
  const row = await insertUser({
    id: 'usr_' + randomUUID(),
    name: displayName,
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    businessName: (businessName && String(businessName).trim()) || `${displayName}'s Business`,
    businessType: (businessType && String(businessType).trim()) || 'E-Commerce',
    avatar: null,
    tier: 'free',
  });

  const emailSent = await sendWelcomeEmail(row.email, row.name);

  return res.json({
    token: await createSession(row.id),
    user: toPublicUser(row),
    isNewUser: true,
    emailSent,
  });
});

app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await findUserByEmail(normalizedEmail);

  // Same generic error and (via the dummy hash) same response time whether
  // the email doesn't exist, has no password (Google-only account), or the
  // password is simply wrong — so a login attempt can't be used to check
  // which emails have a Pinkku account.
  const passwordOk = existing?.password_hash
    ? verifyPassword(password, existing.password_hash)
    : verifyPassword(password, DUMMY_PASSWORD_HASH);
  if (!existing || !passwordOk) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  return res.json({
    token: await createSession(existing.id),
    user: toPublicUser(existing),
    isNewUser: false,
  });
});

// Google Authentication endpoint — takes the ID token minted by Google's
// Identity Services library in the browser (see AuthModal's GoogleLoginButton)
// and verifies its signature + audience server-side, so the email it trusts
// is one Google actually vouches for, never a value the client can just type.
// Login only: it signs in an existing Pinkku account whose email matches the
// verified Google account. It deliberately never auto-creates a new account —
// new users must register with name/email/password first.
app.post('/api/auth/google', loginRateLimiter, async (req, res) => {
  const { credential } = req.body;
  if (!credential || typeof credential !== 'string') {
    return res.status(400).json({ error: 'Google credential is required.' });
  }
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(503).json({ error: 'Google sign-in is not configured on this server.' });
  }

  let payload;
  try {
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error('[auth/google] ID token verification failed:', err);
    return res.status(401).json({ error: 'Invalid or expired Google credential.' });
  }

  if (!payload?.email || !payload.email_verified) {
    return res.status(401).json({ error: 'Google account has no verified email.' });
  }

  const normalizedEmail = payload.email.toLowerCase().trim();
  const existing = await findUserByEmail(normalizedEmail);

  if (!existing) {
    return res.status(404).json({
      error: 'No Pinkku account found for this Google email. Please register first with your name, email, and a password.',
    });
  }

  return res.json({
    token: await createSession(existing.id),
    user: toPublicUser(existing),
    isNewUser: false,
  });
});

app.post('/api/auth/logout', requireAuth, async (req: AuthedRequest, res) => {
  const token = (req.headers.authorization || '').slice(7);
  await deleteRows('sessions', { token });
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Google OAuth — real "Connect Gmail" channel flow (Buffer/Hootsuite-style)
// ---------------------------------------------------------------------------
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/api/oauth/google/callback`;
const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  // Needed to move a message out of Spam (remove the SPAM label) — read-only
  // access can't do that.
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

// Starts the flow: requires an authenticated Pinkku session, returns the
// Google consent URL for the frontend to navigate the browser to.
app.post('/api/oauth/google/start', requireAuth, async (req: AuthedRequest, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(503).json({ error: 'Google OAuth is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.' });
  }

  const state = await createOAuthState(req.user!.id, 'gmail');

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', GOOGLE_SCOPES);
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('state', state);

  return res.json({ redirectUrl: url.toString() });
});

// Google redirects the browser here after the user grants (or denies) consent.
app.get('/api/oauth/google/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect(`/?connect_error=${encodeURIComponent(String(oauthError))}`);
  }
  if (!code || !state) {
    return res.redirect('/?connect_error=missing_code');
  }

  const stateRow = await consumeOAuthState(String(state));
  if (!stateRow) {
    return res.redirect('/?connect_error=invalid_state');
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.redirect('/?connect_error=not_configured');
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData: any = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      console.error('[oauth] Google token exchange failed:', tokenData);
      return res.redirect('/?connect_error=token_exchange_failed');
    }

    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userInfo: any = await userInfoRes.json();

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    // Google only returns a refresh_token on the first-ever consent for this
    // app+user — keep the previously stored one on reconnects that don't get a new one.
    let refreshToken = tokenData.refresh_token || null;
    if (!refreshToken) {
      // Goes through getConnectedAccount (not a raw selectOne) so the
      // existing token comes back decrypted — upsertConnectedAccount below
      // re-encrypts it when it writes the row back.
      const existing = await getConnectedAccount(stateRow.user_id, 'gmail');
      refreshToken = existing?.refresh_token || null;
    }

    await upsertConnectedAccount({
      user_id: stateRow.user_id,
      platform: 'gmail',
      account_email: userInfo.email || null,
      account_name: userInfo.name || null,
      avatar: userInfo.picture || null,
      access_token: tokenData.access_token,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      connected_at: new Date().toISOString(),
    });

    return res.redirect('/?connected=gmail');
  } catch (err) {
    console.error('[oauth] Google callback error:', err);
    return res.redirect('/?connect_error=server_error');
  }
});

// ---------------------------------------------------------------------------
// Facebook (and, via the same Page token, Instagram Business later) —
// connects a Facebook Page the user administers, Buffer/Hootsuite-style.
// ---------------------------------------------------------------------------
const FACEBOOK_API_VERSION = 'v21.0';
const FACEBOOK_REDIRECT_URI = process.env.FACEBOOK_REDIRECT_URI || `http://localhost:${PORT}/api/oauth/facebook/callback`;
// Instagram scopes ('instagram_basic', 'instagram_content_publish') are
// intentionally left out — Meta's app setup now routes Instagram through a
// separate "Instagram API" product with different permission names
// (instagram_business_basic, etc.), so the old Page-linked Instagram scopes
// below are rejected as invalid until that's set up too.
const FACEBOOK_SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'pages_manage_metadata', 'pages_messaging'].join(',');

// Connects one Facebook Page (and its linked Instagram Business account, if
// any) for a user. Shared by the auto-connect path (only one Page found) and
// the page-picker path (/api/oauth/facebook/select-page, for users who admin
// more than one Page).
async function connectFacebookPage(userId: string, page: { id: string; name: string; access_token: string }): Promise<void> {
  await upsertConnectedAccount({
    user_id: userId,
    platform: 'facebook',
    account_name: page.name,
    external_id: page.id,
    access_token: page.access_token,
    connected_at: new Date().toISOString(),
  });

  // Subscribe this Page to the app's webhook for the "messages" field, so
  // incoming Messenger DMs start POSTing to /api/facebook/webhook below
  // instead of just sitting unread in the Page's own inbox.
  try {
    const subRes = await fetch(
      `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${page.id}/subscribed_apps?subscribed_fields=messages&access_token=${encodeURIComponent(page.access_token)}`,
      { method: 'POST' }
    );
    const subData: any = await subRes.json();
    if (!subRes.ok || subData.error) {
      console.error('[oauth] Facebook Page webhook subscription rejected (non-fatal):', subData);
    }
  } catch (subErr) {
    console.error('[oauth] Facebook Page webhook subscription error (non-fatal):', subErr);
  }

  // Instagram Business accounts connect through the same Facebook Page —
  // check if this Page has one linked, and connect it too if so.
  try {
    const igLookupRes = await fetch(
      `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${page.id}?fields=instagram_business_account&access_token=${encodeURIComponent(page.access_token)}`
    );
    const igLookupData: any = await igLookupRes.json();
    const igAccountId = igLookupData.instagram_business_account?.id;

    if (igAccountId) {
      const igDetailsRes = await fetch(
        `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${igAccountId}?fields=username,name,profile_picture_url&access_token=${encodeURIComponent(page.access_token)}`
      );
      const igDetails: any = await igDetailsRes.json();

      await upsertConnectedAccount({
        user_id: userId,
        platform: 'instagram',
        account_name: igDetails.username ? `@${igDetails.username}` : (igDetails.name || 'Instagram Account'),
        avatar: igDetails.profile_picture_url || null,
        external_id: igAccountId,
        access_token: page.access_token,
        connected_at: new Date().toISOString(),
      });
    }
  } catch (igErr) {
    console.error('[oauth] Instagram lookup error (non-fatal):', igErr);
  }
}

app.post('/api/oauth/facebook/start', requireAuth, async (req: AuthedRequest, res) => {
  const appId = process.env.FACEBOOK_APP_ID;
  if (!appId) {
    return res.status(503).json({ error: 'Facebook is not configured yet. Add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET to .env.' });
  }

  const state = await createOAuthState(req.user!.id, 'facebook');

  const url = new URL(`https://www.facebook.com/${FACEBOOK_API_VERSION}/dialog/oauth`);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('redirect_uri', FACEBOOK_REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', FACEBOOK_SCOPES);
  url.searchParams.set('response_type', 'code');

  return res.json({ redirectUrl: url.toString() });
});

app.get('/api/oauth/facebook/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect(`/?connect_error=${encodeURIComponent(String(oauthError))}`);
  }
  if (!code || !state) {
    return res.redirect('/?connect_error=missing_code');
  }

  const stateRow = await consumeOAuthState(String(state), 'facebook');
  if (!stateRow) {
    return res.redirect('/?connect_error=invalid_state');
  }

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    return res.redirect('/?connect_error=not_configured');
  }

  try {
    // 1) Exchange the code for a short-lived user access token.
    const shortLivedUrl = new URL(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/oauth/access_token`);
    shortLivedUrl.searchParams.set('client_id', appId);
    shortLivedUrl.searchParams.set('redirect_uri', FACEBOOK_REDIRECT_URI);
    shortLivedUrl.searchParams.set('client_secret', appSecret);
    shortLivedUrl.searchParams.set('code', String(code));
    const shortLivedRes = await fetch(shortLivedUrl.toString());
    const shortLivedData: any = await shortLivedRes.json();
    if (!shortLivedRes.ok || shortLivedData.error) {
      console.error('[oauth] Facebook token exchange failed:', shortLivedData);
      return res.redirect('/?connect_error=token_exchange_failed');
    }

    // 2) Exchange for a long-lived user access token (~60 days).
    const longLivedUrl = new URL(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/oauth/access_token`);
    longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token');
    longLivedUrl.searchParams.set('client_id', appId);
    longLivedUrl.searchParams.set('client_secret', appSecret);
    longLivedUrl.searchParams.set('fb_exchange_token', shortLivedData.access_token);
    const longLivedRes = await fetch(longLivedUrl.toString());
    const longLivedData: any = await longLivedRes.json();
    const userAccessToken = longLivedData.access_token || shortLivedData.access_token;

    // 3) Find the Facebook Pages this user administers.
    const pagesRes = await fetch(
      `https://graph.facebook.com/${FACEBOOK_API_VERSION}/me/accounts?fields=id,name,picture,access_token&access_token=${encodeURIComponent(userAccessToken)}`
    );
    const pagesData: any = await pagesRes.json();
    if (!pagesRes.ok || pagesData.error) {
      console.error('[oauth] Facebook pages fetch failed:', pagesData);
      return res.redirect('/?connect_error=no_pages');
    }
    const pages = pagesData.data || [];
    if (pages.length === 0) {
      return res.redirect('/?connect_error=no_pages');
    }

    // Only one Page admined — connect it directly, no picker needed.
    if (pages.length === 1) {
      await connectFacebookPage(stateRow.user_id, pages[0]);
      return res.redirect('/?connected=facebook');
    }

    // More than one Page — stash the options server-side and let the user
    // pick which one to connect, rather than silently grabbing the first.
    const selectionToken = await createOAuthState(
      stateRow.user_id,
      'facebook_pages',
      JSON.stringify({
        pages: pages.map((p: any) => ({ id: p.id, name: p.name, picture: p.picture?.data?.url, access_token: p.access_token })),
      })
    );
    return res.redirect(`/?fb_select_pages=${selectionToken}`);
  } catch (err) {
    console.error('[oauth] Facebook callback error:', err);
    return res.redirect('/?connect_error=server_error');
  }
});

// Lists the Pages stashed by the callback above when a user admins more than
// one, so the frontend can render a picker. Page access tokens are kept out
// of the response — the client only ever sees id/name/picture.
app.get('/api/oauth/facebook/pending-pages', requireAuth, async (req: AuthedRequest, res) => {
  const token = String(req.query.token || '');
  if (!token) return res.status(400).json({ error: 'Missing token' });

  const stateRow = await selectOne<{ user_id: string; extra: string | null }>('oauth_states', { state: token, platform: 'facebook_pages' });
  if (!stateRow || stateRow.user_id !== req.user!.id) {
    return res.status(404).json({ error: 'That page selection has expired. Please reconnect Facebook.' });
  }

  const { pages } = JSON.parse(stateRow.extra || '{}');
  return res.json({ pages: (pages || []).map((p: any) => ({ id: p.id, name: p.name, picture: p.picture })) });
});

// Finishes the page-picker flow: connects the one Page the user chose.
app.post('/api/oauth/facebook/select-page', requireAuth, async (req: AuthedRequest, res) => {
  const { token, pageId } = req.body || {};
  if (!token || !pageId) return res.status(400).json({ error: 'Missing token or pageId' });

  const stateRow = await consumeOAuthState(String(token), 'facebook_pages');
  if (!stateRow || stateRow.user_id !== req.user!.id) {
    return res.status(404).json({ error: 'That page selection has expired. Please reconnect Facebook.' });
  }

  const { pages } = JSON.parse(stateRow.extra || '{}');
  const page = (pages || []).find((p: any) => p.id === pageId);
  if (!page) return res.status(400).json({ error: 'Unknown page.' });

  await connectFacebookPage(req.user!.id, page);
  return res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// TikTok — Login Kit OAuth (requires PKCE). Posting on a user's behalf needs
// the separate Content Posting API product, which is more likely to need
// TikTok's review before it works outside sandbox testing.
// ---------------------------------------------------------------------------
const TIKTOK_REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || `http://localhost:${PORT}/api/oauth/tiktok/callback`;

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

app.post('/api/oauth/tiktok/start', requireAuth, async (req: AuthedRequest, res) => {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  if (!clientKey) {
    return res.status(503).json({ error: 'TikTok is not configured yet. Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET to .env.' });
  }

  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
  const state = await createOAuthState(req.user!.id, 'tiktok', JSON.stringify({ codeVerifier }));

  const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
  url.searchParams.set('client_key', clientKey);
  // Only user.info.basic (Login Kit) is actually approved for this app —
  // user.info.stats (Display API) rejects the whole authorization request
  // with a "scope" error, so it's left out until that product is approved.
  url.searchParams.set('scope', 'user.info.basic');
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', TIKTOK_REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return res.json({ redirectUrl: url.toString() });
});

app.get('/api/oauth/tiktok/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect(`/?connect_error=${encodeURIComponent(String(oauthError))}`);
  }
  if (!code || !state) {
    return res.redirect('/?connect_error=missing_code');
  }

  const stateRow = await consumeOAuthState(String(state), 'tiktok');
  if (!stateRow) {
    return res.redirect('/?connect_error=invalid_state');
  }

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) {
    return res.redirect('/?connect_error=not_configured');
  }

  try {
    const { codeVerifier } = JSON.parse(stateRow.extra || '{}');
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code: String(code),
        grant_type: 'authorization_code',
        redirect_uri: TIKTOK_REDIRECT_URI,
        code_verifier: codeVerifier || '',
      }),
    });
    const tokenData: any = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      console.error('[oauth] TikTok token exchange failed:', tokenData);
      return res.redirect('/?connect_error=token_exchange_failed');
    }

    const userRes = await fetch(
      // "username" needs the separate user.info.profile scope — only user.info.basic is
      // requested, and TikTok rejects the whole call if an unauthorized field is asked for.
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
    );
    const userData: any = await userRes.json();
    if (!userRes.ok || (userData.error?.code && userData.error.code !== 'ok')) {
      console.error('[oauth] TikTok user info fetch failed:', userData);
    }
    const info = userData.data?.user || {};

    const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null;

    await upsertConnectedAccount({
      user_id: stateRow.user_id,
      platform: 'tiktok',
      account_name: info.display_name || 'TikTok Account',
      avatar: info.avatar_url || null,
      external_id: info.open_id || null,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: expiresAt,
      connected_at: new Date().toISOString(),
    });

    return res.redirect('/?connected=tiktok');
  } catch (err) {
    console.error('[oauth] TikTok callback error:', err);
    return res.redirect('/?connect_error=server_error');
  }
});

// ---------------------------------------------------------------------------
// TikTok Management — profile + status for the in-Pinkku management page.
// "Connect on TikTok, manage in Pinkku": once authorized, everything below
// happens without sending the user back to TikTok.
// ---------------------------------------------------------------------------
interface TikTokAccessResult {
  accessToken: string;
  expired: boolean;
}

async function getValidTikTokAccessToken(userId: string): Promise<TikTokAccessResult | null> {
  const row = await getConnectedAccount(userId, 'tiktok');
  if (!row || !row.access_token) return null;

  const expiringSoon = row.expires_at && new Date(row.expires_at).getTime() < Date.now() + 60_000;
  if (!expiringSoon) return { accessToken: row.access_token, expired: false };
  if (!row.refresh_token) return { accessToken: row.access_token, expired: true };

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) return { accessToken: row.access_token, expired: true };

  try {
    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: row.refresh_token,
      }),
    });
    const data: any = await tokenRes.json();
    if (!tokenRes.ok || data.error) {
      console.error('[tiktok] token refresh failed:', data);
      return { accessToken: row.access_token, expired: true };
    }
    const newExpiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
    await updateConnectedAccount(userId, 'tiktok', {
      access_token: data.access_token,
      refresh_token: data.refresh_token || row.refresh_token,
      expires_at: newExpiresAt,
    });
    return { accessToken: data.access_token, expired: false };
  } catch (err) {
    console.error('[tiktok] token refresh error:', err);
    return { accessToken: row.access_token, expired: true };
  }
}

// Live status + profile — re-fetches from TikTok (not just cached DB values)
// so the management page can show real CONNECTED / TOKEN_EXPIRED / ERROR states.
app.get('/api/tiktok/status', requireAuth, async (req: AuthedRequest, res) => {
  const row = await getConnectedAccount(req.user!.id, 'tiktok');
  if (!row) {
    return res.json({ status: 'DISCONNECTED' });
  }

  const token = await getValidTikTokAccessToken(req.user!.id);
  if (!token) {
    return res.json({ status: 'DISCONNECTED' });
  }
  if (token.expired) {
    return res.json({
      status: 'TOKEN_EXPIRED',
      profile: { displayName: row.account_name, avatarUrl: row.avatar, openId: row.external_id },
      lastSynced: row.connected_at,
    });
  }

  try {
    const userRes = await fetch(
      // Only fields covered by the approved user.info.basic scope — "username"
      // (user.info.profile) and follower/following/video counts (user.info.stats)
      // aren't approved for this app yet, and TikTok rejects the whole call if
      // an unauthorized field is asked for.
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',
      { headers: { Authorization: `Bearer ${token.accessToken}` } }
    );
    const userData: any = await userRes.json();
    if (userData.error?.code === 'access_token_invalid') {
      return res.json({
        status: 'TOKEN_EXPIRED',
        profile: { displayName: row.account_name, avatarUrl: row.avatar, openId: row.external_id },
        lastSynced: row.connected_at,
      });
    }
    if (!userRes.ok || (userData.error?.code && userData.error.code !== 'ok')) {
      console.error('[tiktok] user info fetch failed:', userData);
      return res.json({
        status: 'ERROR',
        profile: { displayName: row.account_name, avatarUrl: row.avatar, openId: row.external_id },
        lastSynced: row.connected_at,
      });
    }

    const info = userData.data?.user || {};
    const displayName = info.display_name || row.account_name;

    // Keep the cached copy fresh for other parts of the app (e.g. Connections tab).
    await updateConnectedAccount(req.user!.id, 'tiktok', {
      account_name: displayName,
      avatar: info.avatar_url || row.avatar,
    });

    return res.json({
      status: 'CONNECTED',
      profile: {
        displayName,
        avatarUrl: info.avatar_url || row.avatar,
        openId: info.open_id || row.external_id,
        followerCount: info.follower_count ?? null,
        followingCount: info.following_count ?? null,
        videoCount: info.video_count ?? null,
      },
      lastSynced: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[tiktok] status error:', err);
    return res.json({
      status: 'ERROR',
      profile: { displayName: row.account_name, avatarUrl: row.avatar, openId: row.external_id },
      lastSynced: row.connected_at,
    });
  }
});

// AI content assistant for TikTok specifically — a real, working feature
// (unlike an inbox/auto-reply, which needs API access Pinkku doesn't have):
// suggests an attractive caption, hashtags, and concrete growth tips tailored
// to short-form video, using the same Gemini model as the rest of Pinkku's AI.
app.post('/api/tiktok/content-tips', requireAuth, async (req: AuthedRequest, res) => {
  const { topic, businessType } = req.body;
  if (!topic || !String(topic).trim()) {
    return res.status(400).json({ error: 'topic is required.' });
  }

  const apiKey = await resolveGeminiApiKey(req.user!.id);
  if (!apiKey) {
    return res.json({
      caption: `✨ ${topic} — you don't want to miss this! 🔥`,
      hashtags: ['#fyp', '#foryou', '#MyanmarBusiness', '#viral', '#TikTokMadeMeBuyIt'],
      tips: [
        'Hook viewers in the first 2 seconds with the most eye-catching moment.',
        'Use a trending sound to boost reach in the algorithm.',
        'Post when your audience is most active, typically evening hours in Myanmar.',
      ],
    });
  }

  try {
    const ai = getGemini(apiKey);
    const prompt = `You are a TikTok growth strategist helping a Myanmar small business (type: "${businessType || 'General Retail'}") plan a short-form video about: "${topic}".

Give practical, TikTok-specific advice — not generic social media tips. Consider hooks, pacing, trending audio, and hashtag strategy for the Myanmar/Southeast Asian TikTok audience.

Output strictly a JSON object:
{
  "caption": "A short, attention-grabbing caption with emoji, under 150 characters",
  "hashtags": ["6-8 hashtags mixing broad reach tags (#fyp, #foryou) with niche/business-specific ones"],
  "tips": ["3-4 concrete, specific tips for making THIS video attractive and getting more views — not generic advice"]
}`;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text);
    return res.json(parsed);
  } catch (error: any) {
    console.error('[tiktok] content-tips error:', error);
    return res.status(500).json({ error: 'Failed to generate content suggestions.', details: error?.message });
  }
});

// ---------------------------------------------------------------------------
// Telegram — connects the user's own Telegram account to Pinkku's one shared
// bot. There's no OAuth redirect for Telegram; instead the user opens a deep
// link that starts a chat with the bot carrying a one-time code, and a
// long-poll loop (below) picks up their /start message to link their account.
// ---------------------------------------------------------------------------
let telegramBotUsername: string | null = null;
async function getTelegramBotUsername(): Promise<string | null> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return null;
  if (telegramBotUsername) return telegramBotUsername;
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data: any = await res.json();
    if (data.ok) {
      telegramBotUsername = data.result.username;
    }
  } catch (err) {
    console.error('[telegram] getMe failed:', err);
  }
  return telegramBotUsername;
}

// Starts a connection attempt: returns a deep link the frontend sends the
// user's browser to, opening Telegram with a /start code pre-filled.
app.post('/api/connections/telegram/start', requireAuth, async (req: AuthedRequest, res) => {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ error: 'Telegram is not configured yet. Add TELEGRAM_BOT_TOKEN to .env.' });
  }
  const username = await getTelegramBotUsername();
  if (!username) {
    return res.status(502).json({ error: 'Could not reach Telegram to start the connection.' });
  }

  // Telegram's deep-link code doubles as the oauth_states "state" — a short,
  // one-time code rather than a full UUID, so it's typed manually instead of
  // going through createOAuthState (which always generates a UUID).
  const code = randomUUID().replace(/-/g, '').slice(0, 12);
  await insertRow('oauth_states', {
    state: code, user_id: req.user!.id, platform: 'telegram', created_at: new Date().toISOString(),
  });

  return res.json({ deepLink: `https://t.me/${username}?start=${code}`, code });
});

// Frontend polls this while the user is over in Telegram messaging the bot.
app.get('/api/connections/telegram/status', requireAuth, async (req: AuthedRequest, res) => {
  const row = await getConnectedAccount(req.user!.id, 'telegram');
  return res.json({ connected: !!row, accountName: row?.account_name });
});

// A business's permanent, shareable link — a customer who opens this and hits
// Send registers as a contact of this business (distinct from the one-time
// codes above, which link the business owner's own account).
app.get('/api/connections/telegram/customer-link', requireAuth, async (req: AuthedRequest, res) => {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ error: 'Telegram is not configured yet. Add TELEGRAM_BOT_TOKEN to .env.' });
  }
  const username = await getTelegramBotUsername();
  if (!username) {
    return res.status(502).json({ error: 'Could not reach Telegram to build the link.' });
  }
  return res.json({ link: `https://t.me/${username}?start=biz_${req.user!.id}` });
});

// Toggle: when enabled, incoming Telegram customer messages get an AI-drafted
// reply sent automatically instead of waiting for the owner to review and send.
app.get('/api/settings/telegram-auto-reply', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const data = await selectOne<{ telegram_auto_reply: boolean }>('users', { id: req.user!.id }, 'telegram_auto_reply');
    return res.json({ enabled: !!data?.telegram_auto_reply });
  } catch {
    return res.status(500).json({ error: 'Could not load this setting.' });
  }
});

app.patch('/api/settings/telegram-auto-reply', requireAuth, async (req: AuthedRequest, res) => {
  const { enabled } = req.body;
  try {
    await updateRows('users', { id: req.user!.id }, { telegram_auto_reply: !!enabled });
  } catch {
    return res.status(500).json({ error: 'Could not save this setting.' });
  }
  return res.json({ success: true, enabled: !!enabled });
});

// Same idea, for incoming Facebook Messenger DMs to a connected Page.
app.get('/api/settings/facebook-auto-reply', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const data = await selectOne<{ facebook_auto_reply: boolean }>('users', { id: req.user!.id }, 'facebook_auto_reply');
    return res.json({ enabled: !!data?.facebook_auto_reply });
  } catch {
    return res.status(500).json({ error: 'Could not load this setting.' });
  }
});

app.patch('/api/settings/facebook-auto-reply', requireAuth, async (req: AuthedRequest, res) => {
  const { enabled } = req.body;
  try {
    await updateRows('users', { id: req.user!.id }, { facebook_auto_reply: !!enabled });
  } catch {
    return res.status(500).json({ error: 'Could not save this setting.' });
  }
  return res.json({ success: true, enabled: !!enabled });
});

// ---------------------------------------------------------------------------
// FAQ — up to ~6 canned Q&A pairs, checked by findFaqMatch above before any
// Gemini call. Deliberately capped at 6 here (not just in the UI) since
// that's the whole point: a short, easy-to-scan list, not a knowledge base.
// ---------------------------------------------------------------------------
const FAQ_MAX_ENTRIES = 6;

app.get('/api/settings/faq', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const rows = await selectMany('faq_entries', { user_id: req.user!.id }, { orderBy: 'created_at', ascending: true });
    return res.json({
      faqs: rows.map((r: any) => ({ id: r.id, question: r.question, keywords: r.keywords || '', answer: r.answer })),
    });
  } catch (err) {
    console.error('[faq] list error:', err);
    return res.status(500).json({ error: 'Could not load your FAQ list.' });
  }
});

app.post('/api/settings/faq', requireAuth, async (req: AuthedRequest, res) => {
  const { question, keywords, answer } = req.body;
  if (!question || !String(question).trim()) return res.status(400).json({ error: 'A question is required.' });
  if (!answer || !String(answer).trim()) return res.status(400).json({ error: 'An answer is required.' });

  try {
    const existing = await selectMany('faq_entries', { user_id: req.user!.id });
    if (existing.length >= FAQ_MAX_ENTRIES) {
      return res.status(400).json({ error: `You can only save up to ${FAQ_MAX_ENTRIES} FAQs — delete one first.` });
    }
    const id = 'faq_' + randomUUID();
    await insertRow('faq_entries', {
      id,
      user_id: req.user!.id,
      question: String(question).trim(),
      keywords: keywords ? String(keywords).trim() : null,
      answer: String(answer).trim(),
      created_at: new Date().toISOString(),
    });
    return res.json({ success: true, id });
  } catch (err) {
    console.error('[faq] create error:', err);
    return res.status(500).json({ error: 'Could not save this FAQ.' });
  }
});

app.patch('/api/settings/faq/:id', requireAuth, async (req: AuthedRequest, res) => {
  const { question, keywords, answer } = req.body;
  const patch: Record<string, any> = {};
  if (question !== undefined) patch.question = String(question).trim();
  if (keywords !== undefined) patch.keywords = keywords ? String(keywords).trim() : null;
  if (answer !== undefined) patch.answer = String(answer).trim();

  try {
    await updateRows('faq_entries', { user_id: req.user!.id, id: req.params.id }, patch);
    return res.json({ success: true });
  } catch (err) {
    console.error('[faq] update error:', err);
    return res.status(500).json({ error: 'Could not update this FAQ.' });
  }
});

app.delete('/api/settings/faq/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    await deleteRows('faq_entries', { user_id: req.user!.id, id: req.params.id });
    return res.json({ success: true });
  } catch (err) {
    console.error('[faq] delete error:', err);
    return res.status(500).json({ error: 'Could not delete this FAQ.' });
  }
});

// ---------------------------------------------------------------------------
// Bring-your-own Gemini key — see resolveGeminiApiKey above. The key itself
// is never sent back to the browser once saved, only whether one is set.
// ---------------------------------------------------------------------------
app.get('/api/settings/gemini-key', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const key = await getUserGeminiKey(req.user!.id);
    return res.json({ hasKey: !!key, preview: key ? `••••${key.slice(-4)}` : null });
  } catch (err) {
    console.error('[settings] gemini-key read error:', err);
    return res.status(500).json({ error: 'Could not load this setting.' });
  }
});

app.patch('/api/settings/gemini-key', requireAuth, async (req: AuthedRequest, res) => {
  const { apiKey } = req.body;
  try {
    const trimmed = apiKey && String(apiKey).trim() ? String(apiKey).trim() : null;
    await updateRows('users', { id: req.user!.id }, { gemini_api_key: encryptSecret(trimmed) ?? null });
    return res.json({ success: true, hasKey: !!trimmed, preview: trimmed ? `••••${trimmed.slice(-4)}` : null });
  } catch (err) {
    console.error('[settings] gemini-key save error:', err);
    return res.status(500).json({ error: 'Could not save this key.' });
  }
});

function sendTelegramMessage(botToken: string, chatId: string | number, text: string) {
  return fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(() => {});
}

// Scans a single Telegram customer message for a task/event/deadline —
// feeds straight into AI Smart Schedule (schedule_events) alongside
// whatever's detected from Gmail, same "Smart Workspace".
async function detectEventInMessage(text: string, fromName: string, userId?: string): Promise<{
  eventDetected: boolean; eventTitle?: string; eventDate?: string; eventTime?: string | null; importance?: string;
} | null> {
  const apiKey = await resolveGeminiApiKey(userId);
  if (!apiKey) return null;

  try {
    const ai = getGemini(apiKey);
    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Today's date is ${today}. A Telegram message from "${fromName}" says: "${text}"

Does this message contain a specific, real, dated task, deadline, meeting, or event the business owner needs to act on or attend? Ignore generic questions (e.g. "what do you sell", "price?") that have no actual date attached.

Output strictly a JSON object: { "eventDetected": boolean, "eventTitle": string|null, "eventDate": string|null (YYYY-MM-DD, resolve relative dates like "tomorrow" or "Friday" using today's date), "eventTime": string|null (24h HH:MM, or null), "importance": "urgent"|"important"|"normal"|"low" }`;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    return JSON.parse(response.text);
  } catch (err) {
    console.error('[telegram] event detection failed:', err);
    return null;
  }
}

// A business pre-writes up to ~6 canned Q&A pairs (mirrors a Facebook Page's
// native "Frequently Asked Questions" automation) — see /api/settings/faq
// below. A customer message that matches one is answered straight from that
// row, with no Gemini call at all; only an unmatched message falls through
// to generateAIReply. Used by both the Facebook/Telegram auto-reply path and
// the manual "Regenerate" draft button, so the saving applies everywhere a
// reply gets generated.
function normalizeForFaqMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

async function findFaqMatch(userId: string, customerMessage: string): Promise<{ question: string; answer: string } | null> {
  const entries = await selectMany<{ question: string; keywords: string | null; answer: string }>('faq_entries', { user_id: userId });
  if (!entries.length) return null;

  const normalizedMessage = normalizeForFaqMatch(customerMessage);
  for (const entry of entries) {
    const triggers = (entry.keywords && entry.keywords.trim())
      ? entry.keywords.split(',').map((k) => normalizeForFaqMatch(k)).filter(Boolean)
      : [normalizeForFaqMatch(entry.question)];
    if (triggers.some((trigger) => trigger && normalizedMessage.includes(trigger))) {
      return { question: entry.question, answer: entry.answer };
    }
  }
  return null;
}

// Handles one incoming Telegram update, delivered via webhook (see
// POST /api/telegram/webhook below) rather than long-polling — long-polling
// needs a process that stays alive forever, which serverless platforms like
// Vercel don't provide; a webhook is just a normal per-request POST.
//
// Three kinds of incoming messages:
// 1. /start <code> — a business owner linking their own Pinkku account.
// 2. /start biz_<userId> — a customer registering as a contact of that business.
// 3. Any other message from a chat already registered as a customer contact —
//    routed into that business's Customer DMs inbox.
async function handleTelegramUpdate(update: any): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  const msg = update?.message;
  const text: string | undefined = msg?.text;
  if (!msg || !text) return;

  const chatId = String(msg.chat.id);
  const customerName = msg.from.username ? `@${msg.from.username}` : msg.from.first_name;

  const isGroupChat = msg.chat.type === 'group' || msg.chat.type === 'supergroup';

  if (text.startsWith('/start')) {
    const code = text.split(' ')[1];
    if (!code) return;

    if (code.startsWith('biz_')) {
      const ownerUserId = code.slice(4);
      const owner = await selectOne<{ id: string }>('users', { id: ownerUserId }, 'id');
      if (!owner) return;

      if (isGroupChat) {
        // A group (e.g. a class or project chat) — feeds AI Smart Schedule
        // only, never Customer DMs or auto-reply.
        await upsertRow('telegram_groups', {
          chat_id: chatId, owner_user_id: ownerUserId, group_name: msg.chat.title || null, created_at: new Date().toISOString(),
        }, ['chat_id']);
        await sendTelegramMessage(botToken, msg.chat.id, "📌 This group is now linked to Pinkku! I'll scan messages here for tasks, deadlines and events and add them to your AI Smart Schedule.");
      } else {
        await upsertRow('telegram_contacts', {
          chat_id: chatId, owner_user_id: ownerUserId, customer_name: customerName, created_at: new Date().toISOString(),
        }, ['chat_id']);
        await sendTelegramMessage(botToken, msg.chat.id, "👋 You're connected! Send us a message here anytime and we'll get back to you.");
      }
    } else {
      const stateRow = await consumeOAuthState(code, 'telegram');
      if (!stateRow) return;

      await upsertConnectedAccount({
        user_id: stateRow.user_id,
        platform: 'telegram',
        account_name: customerName,
        external_id: chatId,
        connected_at: new Date().toISOString(),
      });
      await sendTelegramMessage(botToken, msg.chat.id, "✅ You're connected to Pinkku! You'll get your customer messages routed here.");
    }
    return;
  }

  // Group chats only ever feed the schedule detector — never Customer
  // DMs, never auto-reply (that would be spammy toward classmates/teammates).
  if (isGroupChat) {
    const group = await selectOne<{ owner_user_id: string }>('telegram_groups', { chat_id: chatId }, 'owner_user_id');
    if (!group) return;

    const detected = await detectEventInMessage(text, customerName, group.owner_user_id);
    if (detected?.eventDetected && detected.eventDate) {
      await insertRow('schedule_events', {
        id: 'tg_' + randomUUID(),
        user_id: group.owner_user_id,
        title: detected.eventTitle || `From ${msg.chat.title || 'group'}`,
        date: detected.eventDate,
        time: detected.eventTime || null,
        importance: detected.importance || 'normal',
        source_subject: `Telegram Group (${msg.chat.title || 'group'}) — ${customerName}: ${text.slice(0, 120)}`,
        manual: false,
        created_at: new Date().toISOString(),
      });
    }
    return;
  }

  // Private chat, not a /start command — route it if this chat is a known customer contact.
  const contact = await selectOne<{ owner_user_id: string; customer_name: string | null }>(
    'telegram_contacts', { chat_id: chatId }, 'owner_user_id, customer_name'
  );
  if (!contact) return;

  const owner = await selectOne<{ business_name: string | null; telegram_auto_reply: boolean }>(
    'users', { id: contact.owner_user_id }, 'business_name, telegram_auto_reply'
  );
  const finalCustomerName = contact.customer_name || customerName;
  let status = 'unread';
  let replyText: string | null = null;

  if (owner?.telegram_auto_reply) {
    try {
      const faqMatch = await findFaqMatch(contact.owner_user_id, text);
      if (faqMatch) {
        replyText = faqMatch.answer;
      } else {
        const reply = await generateAIReply({
          customerMessage: text,
          customerName: finalCustomerName,
          platform: 'telegram',
          businessName: owner.business_name,
          userId: contact.owner_user_id,
        });
        replyText = reply.suggestedReplyMyanmar || reply.suggestedReplyEnglish || null;
      }
      if (replyText) {
        await sendTelegramMessage(botToken, msg.chat.id, replyText);
        status = 'replied';
      }
    } catch (err) {
      console.error('[telegram] auto-reply generation failed:', err);
    }
  }

  await insertRow('customer_messages', {
    id: 'msg_' + randomUUID(),
    user_id: contact.owner_user_id,
    platform: 'telegram',
    external_chat_id: chatId,
    customer_name: finalCustomerName,
    message: text,
    status,
    reply_text: replyText,
    created_at: new Date().toISOString(),
  });

  const detected = await detectEventInMessage(text, finalCustomerName, contact.owner_user_id);
  if (detected?.eventDetected && detected.eventDate) {
    await insertRow('schedule_events', {
      id: 'tg_' + randomUUID(),
      user_id: contact.owner_user_id,
      title: detected.eventTitle || `Message from ${finalCustomerName}`,
      date: detected.eventDate,
      time: detected.eventTime || null,
      importance: detected.importance || 'normal',
      source_subject: `Telegram — ${finalCustomerName}: ${text.slice(0, 120)}`,
      manual: false,
      created_at: new Date().toISOString(),
    });
  }
}

// Telegram POSTs each update here as soon as it happens (configured once via
// scripts/set-telegram-webhook.ts). We verify the secret Telegram echoes back
// on every call, then process the update fully before responding — on
// serverless platforms the function can be frozen the instant a response is
// sent, so "respond first, keep working after" isn't safe here.
app.post('/api/telegram/webhook', async (req, res) => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret && req.headers['x-telegram-bot-api-secret-token'] !== expectedSecret) {
    return res.status(401).end();
  }

  try {
    await handleTelegramUpdate(req.body);
  } catch (err) {
    console.error('[telegram] webhook handling error:', err);
  }
  return res.status(200).end();
});

// ---------------------------------------------------------------------------
// Facebook Messenger — incoming DMs to a connected Page, delivered via
// webhook (subscribed right after the Page is connected, above). Unlike
// Telegram's one-shared-bot setup, each business has its own Page, so the
// Page ID in the webhook payload tells us directly which owner_user_id this
// message belongs to — no separate "contacts" mapping table needed.
// ---------------------------------------------------------------------------
function sendFacebookMessage(pageAccessToken: string, recipientPsid: string, text: string) {
  return fetch(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/me/messages?access_token=${encodeURIComponent(pageAccessToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipient: { id: recipientPsid }, message: { text } }),
  }).catch(() => {});
}

async function handleFacebookEntry(entry: any): Promise<void> {
  const pageId = entry.id;
  const events = entry.messaging || [];

  for (const event of events) {
    const senderId: string | undefined = event.sender?.id;
    const text: string | undefined = event.message?.text;
    // Skip delivery/read receipts, postbacks, and echoes of the Page's own sent messages.
    if (!senderId || !text || event.message?.is_echo) continue;

    const account = await getConnectedAccountByExternalId('facebook', pageId);
    if (!account || !account.access_token) continue;

    let customerName = 'Facebook Customer';
    try {
      const profileRes = await fetch(
        `https://graph.facebook.com/${FACEBOOK_API_VERSION}/${senderId}?fields=first_name,last_name&access_token=${encodeURIComponent(account.access_token)}`
      );
      const profile: any = await profileRes.json();
      if (profile.first_name) customerName = [profile.first_name, profile.last_name].filter(Boolean).join(' ');
    } catch {
      // Profile lookup failed — the generic fallback name above is fine.
    }

    const owner = await selectOne<{ business_name: string | null; facebook_auto_reply: boolean }>(
      'users', { id: account.user_id }, 'business_name, facebook_auto_reply'
    );
    let status = 'unread';
    let replyText: string | null = null;

    if (owner?.facebook_auto_reply) {
      try {
        const faqMatch = await findFaqMatch(account.user_id, text);
        if (faqMatch) {
          replyText = faqMatch.answer;
        } else {
          const reply = await generateAIReply({
            customerMessage: text,
            customerName,
            platform: 'facebook',
            businessName: owner.business_name,
            userId: account.user_id,
          });
          replyText = reply.suggestedReplyMyanmar || reply.suggestedReplyEnglish || null;
        }
        if (replyText) {
          await sendFacebookMessage(account.access_token, senderId, replyText);
          status = 'replied';
        }
      } catch (err) {
        console.error('[facebook] auto-reply generation failed:', err);
      }
    }

    await insertRow('customer_messages', {
      id: 'msg_' + randomUUID(),
      user_id: account.user_id,
      platform: 'facebook',
      external_chat_id: senderId,
      customer_name: customerName,
      message: text,
      status,
      reply_text: replyText,
      created_at: new Date().toISOString(),
    });

    const detected = await detectEventInMessage(text, customerName, account.user_id);
    if (detected?.eventDetected && detected.eventDate) {
      await insertRow('schedule_events', {
        id: 'fb_' + randomUUID(),
        user_id: account.user_id,
        title: detected.eventTitle || `Message from ${customerName}`,
        date: detected.eventDate,
        time: detected.eventTime || null,
        importance: detected.importance || 'normal',
        source_subject: `Facebook Messenger — ${customerName}: ${text.slice(0, 120)}`,
        manual: false,
        created_at: new Date().toISOString(),
      });
    }
  }
}

// Meta's one-time handshake to verify you control this callback URL —
// configured once in the app's Webhooks product settings (Callback URL +
// Verify Token), same idea as Telegram's webhook secret above.
app.get('/api/facebook/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expectedToken = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && expectedToken && token === expectedToken) {
    return res.status(200).send(String(challenge ?? ''));
  }
  return res.status(403).end();
});

// Meta POSTs every Page event here (message received, delivered, read,
// etc.) once the Page is subscribed. Process fully before responding, same
// reasoning as the Telegram webhook — serverless functions can freeze
// immediately after the response is sent.
app.post('/api/facebook/webhook', async (req, res) => {
  try {
    const body = req.body;
    if (body?.object === 'page') {
      for (const entry of body.entry || []) {
        await handleFacebookEntry(entry);
      }
    }
  } catch (err) {
    console.error('[facebook] webhook handling error:', err);
  }
  return res.status(200).end();
});

// ---------------------------------------------------------------------------
// Connected channels (real, per-user — backed by connected_accounts)
// ---------------------------------------------------------------------------
app.get('/api/connections', requireAuth, async (req: AuthedRequest, res) => {
  const rows = await selectMany(
    'connected_accounts',
    { user_id: req.user!.id },
    { columns: 'platform, account_email, account_name, avatar, connected_at' }
  );

  return res.json({
    connections: (rows || []).map(r => ({
      platform: r.platform,
      accountEmail: r.account_email,
      accountName: r.account_name,
      avatar: r.avatar,
      connectedAt: r.connected_at,
    })),
  });
});

app.post('/api/connections/:platform/disconnect', requireAuth, async (req: AuthedRequest, res) => {
  await deleteRows('connected_accounts', { user_id: req.user!.id, platform: req.params.platform });
  return res.json({ success: true });
});

// ---------------------------------------------------------------------------
// Gmail — real inbox read/send using the connected account's OAuth tokens
// ---------------------------------------------------------------------------
interface ConnectedAccountRow {
  user_id: string;
  platform: string;
  account_email: string | null;
  account_name: string | null;
  avatar: string | null;
  external_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  connected_at: string;
}

async function getValidGoogleAccessToken(userId: string): Promise<string | null> {
  const row = await getConnectedAccount(userId, 'gmail');
  if (!row || !row.access_token) return null;

  const expiringSoon = row.expires_at && new Date(row.expires_at).getTime() < Date.now() + 60_000;
  if (!expiringSoon || !row.refresh_token) return row.access_token;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return row.access_token;

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: row.refresh_token,
        grant_type: 'refresh_token',
      }),
    });
    const data: any = await tokenRes.json();
    if (!tokenRes.ok || data.error) {
      console.error('[gmail] token refresh failed:', data);
      return row.access_token;
    }
    const newExpiresAt = data.expires_in ? new Date(Date.now() + data.expires_in * 1000).toISOString() : null;
    await updateConnectedAccount(userId, 'gmail', { access_token: data.access_token, expires_at: newExpiresAt });
    return data.access_token;
  } catch (err) {
    console.error('[gmail] token refresh error:', err);
    return row.access_token;
  }
}

function gmailHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
}

app.get('/api/gmail/messages', requireAuth, async (req: AuthedRequest, res) => {
  const accessToken = await getValidGoogleAccessToken(req.user!.id);
  if (!accessToken) {
    return res.status(404).json({ error: 'Gmail is not connected for this account yet.' });
  }

  try {
    const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : '';
    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    listUrl.searchParams.set('maxResults', '20');
    listUrl.searchParams.set('labelIds', 'INBOX');
    if (pageToken) listUrl.searchParams.set('pageToken', pageToken);

    const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    const listData: any = await listRes.json();
    if (!listRes.ok) {
      return res.status(listRes.status).json({ error: listData.error?.message || 'Failed to list Gmail messages.' });
    }

    const messageStubs: { id: string }[] = listData.messages || [];
    const messages = await Promise.all(messageStubs.map(async (stub) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${stub.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData: any = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      return {
        id: msgData.id as string,
        threadId: msgData.threadId as string,
        from: gmailHeader(headers, 'From'),
        subject: gmailHeader(headers, 'Subject') || '(no subject)',
        date: gmailHeader(headers, 'Date'),
        snippet: (msgData.snippet as string) || '',
        unread: ((msgData.labelIds as string[]) || []).includes('UNREAD'),
      };
    }));

    return res.json({ messages, nextPageToken: listData.nextPageToken || null });
  } catch (err) {
    console.error('[gmail] fetch messages error:', err);
    return res.status(502).json({ error: 'Could not reach Gmail.' });
  }
});

// Gmail's own spam filter can wrongly catch legitimate business emails —
// this scans the Spam label so the AI importance triage can catch anything
// that looks like it shouldn't be there.
app.get('/api/gmail/spam', requireAuth, async (req: AuthedRequest, res) => {
  const accessToken = await getValidGoogleAccessToken(req.user!.id);
  if (!accessToken) {
    return res.status(404).json({ error: 'Gmail is not connected for this account yet.' });
  }

  try {
    const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : '';
    const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
    listUrl.searchParams.set('maxResults', '20');
    listUrl.searchParams.set('labelIds', 'SPAM');
    if (pageToken) listUrl.searchParams.set('pageToken', pageToken);

    const listRes = await fetch(listUrl.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
    const listData: any = await listRes.json();
    if (!listRes.ok) {
      return res.status(listRes.status).json({ error: listData.error?.message || 'Failed to list spam messages.' });
    }

    const messageStubs: { id: string }[] = listData.messages || [];
    const messages = await Promise.all(messageStubs.map(async (stub) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${stub.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData: any = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      return {
        id: msgData.id as string,
        threadId: msgData.threadId as string,
        from: gmailHeader(headers, 'From'),
        subject: gmailHeader(headers, 'Subject') || '(no subject)',
        date: gmailHeader(headers, 'Date'),
        snippet: (msgData.snippet as string) || '',
        unread: ((msgData.labelIds as string[]) || []).includes('UNREAD'),
      };
    }));

    return res.json({ messages, nextPageToken: listData.nextPageToken || null });
  } catch (err) {
    console.error('[gmail] fetch spam error:', err);
    return res.status(502).json({ error: 'Could not reach Gmail.' });
  }
});

// Moves a message out of Spam and into the Inbox.
app.post('/api/gmail/messages/:id/unspam', requireAuth, async (req: AuthedRequest, res) => {
  const accessToken = await getValidGoogleAccessToken(req.user!.id);
  if (!accessToken) {
    return res.status(404).json({ error: 'Gmail is not connected for this account yet.' });
  }

  try {
    const modRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${req.params.id}/modify`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['SPAM'], addLabelIds: ['INBOX'] }),
      }
    );
    const modData: any = await modRes.json();
    if (!modRes.ok) {
      return res.status(modRes.status).json({ error: modData.error?.message || 'Failed to move this message out of Spam.' });
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('[gmail] unspam error:', err);
    return res.status(502).json({ error: 'Could not reach Gmail.' });
  }
});

app.post('/api/gmail/send', requireAuth, async (req: AuthedRequest, res) => {
  const { to, subject, body, threadId } = req.body;
  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'to, subject, and body are required.' });
  }

  const accessToken = await getValidGoogleAccessToken(req.user!.id);
  if (!accessToken) {
    return res.status(404).json({ error: 'Gmail is not connected for this account yet.' });
  }

  const rawMessage = `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${body}`;
  const raw = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
    });
    const sendData: any = await sendRes.json();
    if (!sendRes.ok) {
      return res.status(sendRes.status).json({ error: sendData.error?.message || 'Failed to send email.' });
    }
    return res.json({ success: true, id: sendData.id });
  } catch (err) {
    console.error('[gmail] send error:', err);
    return res.status(502).json({ error: 'Could not reach Gmail to send the email.' });
  }
});

// AI reads a batch of emails and tags each with an urgency color, plus pulls
// out any real event/deadline it finds so it can be one-click added to the
// user's actual Google Calendar.
function decodeGmailPart(payload: any): string {
  if (!payload) return '';

  function findBody(node: any, wantMime: string): string | null {
    if (node.mimeType === wantMime && node.body?.data) return node.body.data;
    for (const part of node.parts || []) {
      const found = findBody(part, wantMime);
      if (found) return found;
    }
    return null;
  }

  const data = findBody(payload, 'text/plain') || findBody(payload, 'text/html') || payload.body?.data;
  if (!data) return '';

  try {
    const decoded = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    // Strip HTML tags in case only a text/html part was available.
    return decoded.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

app.post('/api/gmail/analyze', requireAuth, async (req: AuthedRequest, res) => {
  const { messages } = req.body as { messages?: { id: string; subject: string; snippet: string }[] };
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.json({ results: [] });
  }

  const apiKey = await resolveGeminiApiKey(req.user!.id);
  if (!apiKey) {
    // Fallback so the UI still has something reasonable without a Gemini key.
    return res.json({
      results: messages.map(m => ({ id: m.id, importance: 'normal', eventDetected: false })),
    });
  }

  // Read the full email body (not just the short preview snippet) so the AI
  // can find dates/deadlines that are buried further down in longer emails.
  const accessToken = await getValidGoogleAccessToken(req.user!.id);
  const enriched = await Promise.all(messages.map(async (m) => {
    if (!accessToken) return { ...m, body: m.snippet };
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!msgRes.ok) return { ...m, body: m.snippet };
      const msgData: any = await msgRes.json();
      const fullBody = decodeGmailPart(msgData.payload);
      return { ...m, body: (fullBody || m.snippet).slice(0, 3000) };
    } catch {
      return { ...m, body: m.snippet };
    }
  }));

  try {
    const ai = getGemini(apiKey);
    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Today's date is ${today}. You are triaging a business owner's email inbox.
For each email below, decide "importance" using exactly these four categories:

- "urgent": account security or login alerts (e.g. "Security alert", new sign-in notifications, password/account warnings) and anything of similarly critical, account-safety nature.
- "important": the recipient needs to actually DO or ATTEND something tied to a specific date — a meeting, a deadline, a submission, an appointment, a booking.
- "normal": social/networking notifications — someone inviting you to connect, an invitation being accepted, "X sent you a message", "X shared a post", people-you-may-know suggestions, and similar.
- "low": routine account/app/website connection confirmations — "you connected with X", "you shared data with X", third-party app link confirmations, and generic promotional/marketing/ad content.

For any email that doesn't exactly match one of these examples, classify it by which of the four it's most analogous to — every email must get one of these four labels, there is no fifth category.

Also decide:
- "eventDetected": true only if the email clearly refers to a specific meeting, deadline, appointment, or dated event the recipient must act on or attend.
- If eventDetected, also give "eventTitle" (short), "eventDate" (resolve relative dates like "tomorrow" or "Friday" into an actual YYYY-MM-DD date using today's date as reference), and "eventTime" (24h HH:MM, or null if no time is mentioned).

Each email's full body text is included below (not just a preview), so look through the whole thing for dates/deadlines.

Emails:
${JSON.stringify(enriched.map(m => ({ id: m.id, subject: m.subject, body: m.body })))}

Output strictly a JSON object: { "results": [ { "id": string, "importance": string, "eventDetected": boolean, "eventTitle": string|null, "eventDate": string|null, "eventTime": string|null } ] }. One entry per email, matching "id" exactly.`;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text);
    return res.json({ results: parsed.results || [] });
  } catch (err) {
    console.error('[gmail] analyze error:', err);
    return res.json({
      results: messages.map(m => ({ id: m.id, importance: 'normal', eventDetected: false })),
    });
  }
});

// Creates a real event on the connected account's actual Google Calendar.
app.post('/api/calendar/events', requireAuth, async (req: AuthedRequest, res) => {
  const { title, date, time, description } = req.body;
  if (!title || !date) {
    return res.status(400).json({ error: 'title and date are required.' });
  }

  const accessToken = await getValidGoogleAccessToken(req.user!.id);
  if (!accessToken) {
    return res.status(404).json({ error: 'Gmail/Calendar is not connected for this account yet.' });
  }

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const eventBody: any = {
    summary: title,
    description: description || undefined,
  };

  if (time) {
    const startDateTime = `${date}T${time}:00`;
    const [h, m] = time.split(':').map(Number);
    const endDate = new Date(`${date}T${time}:00`);
    endDate.setHours(endDate.getHours() + 1);
    eventBody.start = { dateTime: startDateTime, timeZone };
    eventBody.end = { dateTime: endDate.toISOString().slice(0, 19), timeZone };
  } else {
    eventBody.start = { date };
    eventBody.end = { date };
  }

  try {
    const calRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    });
    const calData: any = await calRes.json();
    if (!calRes.ok) {
      return res.status(calRes.status).json({ error: calData.error?.message || 'Failed to create the calendar event.' });
    }
    return res.json({ success: true, eventId: calData.id, htmlLink: calData.htmlLink });
  } catch (err) {
    console.error('[calendar] create event error:', err);
    return res.status(502).json({ error: 'Could not reach Google Calendar.' });
  }
});

// Scans the inbox for real, dated business events (deadlines, meetings,
// submissions, results announcements) — not the user's whole personal Google
// Calendar — so the Social Calendar can show what's actually worth knowing
// about from email, same idea as the "storyboard deadline" example.
app.get('/api/calendar/detected-events', requireAuth, async (req: AuthedRequest, res) => {
  const accessToken = await getValidGoogleAccessToken(req.user!.id);
  if (!accessToken) {
    return res.status(404).json({ error: 'Gmail is not connected for this account yet.' });
  }

  const apiKey = await resolveGeminiApiKey(req.user!.id);
  if (!apiKey) {
    return res.json({ events: [] });
  }

  try {
    const listRes = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=60&labelIds=INBOX',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData: any = await listRes.json();
    if (!listRes.ok) {
      return res.status(listRes.status).json({ error: listData.error?.message || 'Failed to list Gmail messages.' });
    }

    const stubs: { id: string }[] = listData.messages || [];
    const messages = await Promise.all(stubs.map(async (stub) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${stub.id}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const msgData: any = await msgRes.json();
      const headers = msgData.payload?.headers || [];
      return {
        id: msgData.id as string,
        subject: gmailHeader(headers, 'Subject') || '(no subject)',
        body: decodeGmailPart(msgData.payload).slice(0, 3000),
      };
    }));

    const ai = getGemini(apiKey);
    const today = new Date().toISOString().slice(0, 10);
    const prompt = `Today's date is ${today}. Scan these emails and find ONLY the ones that mention a specific, real, dated action item the recipient needs to know about or act on by that date. This includes (but isn't limited to):
- Meetings, appointments, workshops, or sessions to attend
- Deadlines to submit, register, apply, or respond by
- Pickups, collections, or deliveries to go get in person (e.g. "your order is ready for pickup on...", "collect your package by...")
- Results, announcements, or decisions being released on a specific date
- Bookings, reservations, or confirmed dates for a service

Examples: "results will be released on...", "meeting scheduled for...", "submission deadline is...", "ready for collection on...", "please attend on...". Ignore emails with no real date mentioned, and ignore vague/relative mentions with no resolvable date.

Emails:
${JSON.stringify(messages.map(m => ({ id: m.id, subject: m.subject, body: m.body })))}

Output strictly a JSON object: { "results": [ { "id": string, "eventDetected": boolean, "eventTitle": string|null, "eventDate": string|null (YYYY-MM-DD, resolve relative dates using today's date), "eventTime": string|null (24h HH:MM, or null), "importance": "urgent"|"important"|"normal"|"low" } ] }. Only include entries where eventDetected is true.`;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(response.text);
    const results: any[] = (parsed.results || []).filter((r: any) => r.eventDetected && r.eventDate);

    const events = results.map((r: any) => {
      const msg = messages.find(m => m.id === r.id);
      return {
        id: r.id,
        title: r.eventTitle || msg?.subject || 'Untitled',
        date: r.eventDate,
        time: r.eventTime || null,
        importance: r.importance || 'normal',
        sourceSubject: msg?.subject || '',
      };
    });

    return res.json({ events });
  } catch (err) {
    console.error('[calendar] detected-events error:', err);
    return res.status(502).json({ error: 'Could not analyze your inbox for events.' });
  }
});

// ---------------------------------------------------------------------------
// AI Smart Schedule — Pinkku's own in-app schedule (separate from Google
// Calendar). Stores manually-added events, and a snapshot of any Gmail-detected
// event the user has added, so both survive refresh/logout.
// ---------------------------------------------------------------------------
app.get('/api/schedule/events', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const data = await selectMany('schedule_events', { user_id: req.user!.id });
    return res.json({
      events: (data || []).map(r => ({
        id: r.id,
        title: r.title,
        date: r.date,
        time: r.time,
        importance: r.importance,
        sourceSubject: r.source_subject || '',
        manual: !!r.manual,
      })),
    });
  } catch (err) {
    console.error('[schedule] list error:', err);
    return res.status(500).json({ error: 'Could not load your schedule.' });
  }
});

app.post('/api/schedule/events', requireAuth, async (req: AuthedRequest, res) => {
  const { id, title, date, time, importance, sourceSubject, manual } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required.' });
  if (!date) return res.status(400).json({ error: 'date is required.' });

  const eventId = id || `manual_${randomUUID()}`;
  try {
    await upsertRow('schedule_events', {
      id: eventId,
      user_id: req.user!.id,
      title,
      date,
      time: time || null,
      importance: importance || 'normal',
      source_subject: sourceSubject || null,
      manual: !!manual,
      created_at: new Date().toISOString(),
    }, ['user_id', 'id']);
    return res.json({ success: true, id: eventId });
  } catch (err) {
    console.error('[schedule] save error:', err);
    return res.status(500).json({ error: 'Could not save this event to your schedule.' });
  }
});

app.delete('/api/schedule/events/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    await deleteRows('schedule_events', { user_id: req.user!.id, id: req.params.id });
    return res.json({ success: true });
  } catch (err) {
    console.error('[schedule] delete error:', err);
    return res.status(500).json({ error: 'Could not remove this event.' });
  }
});

// ---------------------------------------------------------------------------
// Posts — persisted content with a solo-review workflow:
// draft -> pending_review -> scheduled -> published.
// ---------------------------------------------------------------------------

// The Content Creator's attached photo arrives as a base64 data: URL (see
// mediaPreview in ContentCreatorView.tsx). Without Cloudinary configured
// that's stored as-is in posts.media_url, which works fine at small scale
// but bloats the database as post volume grows. When CLOUDINARY_* is set,
// this uploads it once at save time and swaps in the hosted https URL
// instead — smaller rows, and Facebook can then fetch the photo straight
// from that URL at publish time rather than us re-uploading the binary.
async function uploadToCloudinaryIfConfigured(mediaUrl: string | null | undefined): Promise<string | null | undefined> {
  if (!mediaUrl || !mediaUrl.startsWith('data:')) return mediaUrl;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) return mediaUrl;

  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHash('sha1').update(`timestamp=${timestamp}${apiSecret}`).digest('hex');
    const form = new FormData();
    form.append('file', mediaUrl);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('signature', signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    });
    const data: any = await res.json();
    if (!res.ok || data.error) {
      console.error('[media] Cloudinary upload failed:', data);
      return mediaUrl; // keep the photo by falling back to the data: URL rather than dropping it
    }
    return data.secure_url || mediaUrl;
  } catch (err) {
    console.error('[media] Cloudinary upload error:', err);
    return mediaUrl;
  }
}

function toPostResponse(r: any) {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    myanmarContent: r.myanmar_content || undefined,
    platforms: JSON.parse(r.platforms || '[]'),
    scheduledDate: r.scheduled_date || undefined,
    scheduledTime: r.scheduled_time || undefined,
    status: r.status,
    tone: r.tone || undefined,
    tags: r.tags ? JSON.parse(r.tags) : undefined,
    mediaUrl: r.media_url || undefined,
    createdAt: r.created_at,
  };
}

// Publishes a saved post's content to each of its target platforms that
// support real publishing today — currently just a connected Facebook Page
// (Instagram/TikTok/Telegram broadcast posting isn't wired up yet, see the
// Instagram scopes note near FACEBOOK_SCOPES above). Shared by the manual
// "Publish Now" action and the scheduled-post sweep below.
// The Content Creator's "Add photo or video" attachment is stored as a
// data: URL (base64) — see mediaPreview in ContentCreatorView.tsx. Facebook's
// /photos endpoint wants either raw binary (multipart `source`) or a public
// `url` it can fetch itself, so a data: URL has to be decoded into binary
// before it can be uploaded; a plain http(s) URL (e.g. pasted in later) can
// be passed straight through via the `url` param instead.
function parseDataUrl(value: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/.exec(value);
  if (!match) return null;
  return { buffer: Buffer.from(match[2], 'base64'), contentType: match[1] };
}

async function publishPostNow(post: {
  id: string;
  user_id: string;
  title: string;
  content: string;
  myanmar_content: string | null;
  platforms: string;
  media_url?: string | null;
}): Promise<{ status: 'published' | 'failed'; results: Record<string, { ok: boolean; error?: string; externalId?: string }> }> {
  const platforms: string[] = JSON.parse(post.platforms || '[]');
  const message = post.myanmar_content || post.content || post.title;
  const results: Record<string, { ok: boolean; error?: string; externalId?: string }> = {};

  for (const platform of platforms) {
    if (platform !== 'facebook') {
      results[platform] = { ok: false, error: 'Auto-publish is not supported for this platform yet — copy the caption and post it manually.' };
      continue;
    }

    const account = await getConnectedAccount(post.user_id, 'facebook');
    if (!account) {
      results.facebook = { ok: false, error: 'Facebook is not connected.' };
      continue;
    }

    try {
      const inlineImage = post.media_url ? parseDataUrl(post.media_url) : null;
      let res: Response;

      if (inlineImage) {
        // Photo attached in-browser — upload the decoded binary directly.
        const form = new FormData();
        form.append('caption', message);
        form.append('access_token', account.access_token!);
        form.append('source', new Blob([new Uint8Array(inlineImage.buffer)], { type: inlineImage.contentType }), 'post-media');
        res = await fetch(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/${account.external_id}/photos`, {
          method: 'POST',
          body: form,
        });
      } else if (post.media_url) {
        // A plain hosted URL — let Facebook fetch it directly.
        res = await fetch(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/${account.external_id}/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: post.media_url, caption: message, access_token: account.access_token }),
        });
      } else {
        // No media — plain text post.
        res = await fetch(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/${account.external_id}/feed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, access_token: account.access_token }),
        });
      }

      const data: any = await res.json();
      if (!res.ok || data.error) {
        console.error('[posts] Facebook publish failed:', data);
        results.facebook = { ok: false, error: data.error?.message || 'Facebook rejected the post.' };
      } else {
        results.facebook = { ok: true, externalId: data.post_id || data.id };
      }
    } catch (err) {
      console.error('[posts] Facebook publish error:', err);
      results.facebook = { ok: false, error: 'Network error while posting to Facebook.' };
    }
  }

  const status: 'published' | 'failed' = Object.values(results).some((r) => r.ok) ? 'published' : 'failed';
  const now = new Date().toISOString();
  await updateRows('posts', { user_id: post.user_id, id: post.id }, { status, updated_at: now });

  // One row per platform so "Facebook posted, Instagram failed" survives a
  // page reload instead of only existing in the response of this one call.
  await Promise.all(
    Object.entries(results).map(([platform, r]) =>
      upsertRow(
        'post_targets',
        {
          id: `pt_${post.id}_${platform}`,
          post_id: post.id,
          user_id: post.user_id,
          platform,
          status: r.ok ? 'published' : 'failed',
          external_post_id: r.externalId || null,
          error_message: r.ok ? null : r.error || null,
          published_at: r.ok ? now : null,
          created_at: now,
          updated_at: now,
        },
        ['post_id', 'platform']
      )
    )
  );

  return { status, results };
}

// Sweeps for posts whose scheduled time has arrived and auto-publishes them.
// Only meaningful under a persistent process (local `npm start` via
// server.ts) — a Vercel serverless function has no background timer, so
// scheduled posts there still need the manual "Publish Now" action or a
// Vercel Cron job hitting a dedicated endpoint.
export async function publishDuePosts(): Promise<void> {
  try {
    const due = await selectMany<{
      id: string; user_id: string; title: string; content: string; myanmar_content: string | null;
      platforms: string; scheduled_date: string | null; scheduled_time: string | null; media_url: string | null;
    }>('posts', { status: 'scheduled' });
    const now = Date.now();
    for (const post of due) {
      if (!post.scheduled_date) continue;
      const due_at = new Date(`${post.scheduled_date}T${post.scheduled_time || '00:00'}:00`).getTime();
      if (Number.isNaN(due_at) || due_at > now) continue;
      await publishPostNow(post);
    }
  } catch (err) {
    console.error('[posts] scheduled publish sweep failed:', err);
  }
}

app.get('/api/posts', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const data = await selectMany('posts', { user_id: req.user!.id }, { orderBy: 'created_at', ascending: false });
    const targetRows = await selectMany<{ post_id: string; platform: string; status: string; error_message: string | null; external_post_id: string | null }>(
      'post_targets', { user_id: req.user!.id }
    );
    const targetsByPost: Record<string, { platform: string; status: string; error?: string; externalId?: string }[]> = {};
    for (const t of targetRows) {
      (targetsByPost[t.post_id] ??= []).push({
        platform: t.platform,
        status: t.status,
        error: t.error_message || undefined,
        externalId: t.external_post_id || undefined,
      });
    }
    return res.json({
      posts: (data || []).map((r) => ({ ...toPostResponse(r), targets: targetsByPost[r.id] || [] })),
    });
  } catch (err) {
    console.error('[posts] list error:', err);
    return res.status(500).json({ error: 'Could not load your posts.' });
  }
});

app.post('/api/posts', requireAuth, async (req: AuthedRequest, res) => {
  const { title, content, myanmarContent, platforms, status, tone, tags, mediaUrl } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required.' });
  if (!Array.isArray(platforms) || platforms.length === 0) return res.status(400).json({ error: 'At least one platform is required.' });

  const id = 'post_' + randomUUID();
  const now = new Date().toISOString();
  try {
    const storedMediaUrl = await uploadToCloudinaryIfConfigured(mediaUrl);
    await insertRow('posts', {
      id,
      user_id: req.user!.id,
      title,
      content: content || '',
      myanmar_content: myanmarContent || null,
      platforms: JSON.stringify(platforms),
      status: status === 'pending_review' ? 'pending_review' : 'draft',
      tone: tone || null,
      tags: tags ? JSON.stringify(tags) : null,
      media_url: storedMediaUrl || null,
      created_at: now,
      updated_at: now,
    });
    return res.json({ success: true, id });
  } catch (err) {
    console.error('[posts] create error:', err);
    return res.status(500).json({ error: 'Could not save this post.' });
  }
});

app.patch('/api/posts/:id', requireAuth, async (req: AuthedRequest, res) => {
  const { title, content, myanmarContent, status, scheduledDate, scheduledTime, mediaUrl } = req.body;
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (title !== undefined) patch.title = title;
  if (content !== undefined) patch.content = content;
  if (myanmarContent !== undefined) patch.myanmar_content = myanmarContent;
  if (status !== undefined) patch.status = status;
  if (scheduledDate !== undefined) patch.scheduled_date = scheduledDate;
  if (scheduledTime !== undefined) patch.scheduled_time = scheduledTime;

  try {
    if (mediaUrl !== undefined) patch.media_url = await uploadToCloudinaryIfConfigured(mediaUrl);
    await updateRows('posts', { user_id: req.user!.id, id: req.params.id }, patch);
    return res.json({ success: true });
  } catch (err) {
    console.error('[posts] update error:', err);
    return res.status(500).json({ error: 'Could not update this post.' });
  }
});

app.post('/api/posts/:id/publish', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const post = await selectOne<any>('posts', { user_id: req.user!.id, id: req.params.id });
    if (!post) return res.status(404).json({ error: 'Post not found.' });

    const { status, results } = await publishPostNow(post);
    return res.json({ success: status === 'published', status, results });
  } catch (err) {
    console.error('[posts] publish error:', err);
    return res.status(500).json({ error: 'Could not publish this post.' });
  }
});

app.delete('/api/posts/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    await deleteRows('posts', { user_id: req.user!.id, id: req.params.id });
    return res.json({ success: true });
  } catch (err) {
    console.error('[posts] delete error:', err);
    return res.status(500).json({ error: 'Could not remove this post.' });
  }
});

// ---------------------------------------------------------------------------
// Customer Messages — real inbound messages (Telegram, routed via
// telegram_contacts above; Facebook Messenger, routed via the connected
// Page's external_id above) shown in the Customer DMs inbox.
// ---------------------------------------------------------------------------
app.get('/api/messages', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const data = await selectMany('customer_messages', { user_id: req.user!.id }, { orderBy: 'created_at', ascending: false });
    return res.json({
      messages: (data || []).map(r => ({
        id: r.id,
        customerName: r.customer_name,
        platform: r.platform,
        message: r.message,
        timestamp: r.created_at,
        status: r.status,
        suggestedReplyMyanmar: r.reply_text || undefined,
      })),
    });
  } catch (err) {
    console.error('[messages] list error:', err);
    return res.status(500).json({ error: 'Could not load your messages.' });
  }
});

app.post('/api/messages/:id/reply', requireAuth, async (req: AuthedRequest, res) => {
  const { replyText } = req.body;
  if (!replyText || !String(replyText).trim()) return res.status(400).json({ error: 'replyText is required.' });

  try {
    const row = await selectOne('customer_messages', { user_id: req.user!.id, id: req.params.id });
    if (!row) return res.status(404).json({ error: 'Message not found.' });

    if (row.platform === 'telegram' && row.external_chat_id) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) await sendTelegramMessage(botToken, row.external_chat_id, replyText);
    }

    if (row.platform === 'facebook' && row.external_chat_id) {
      const account = await getConnectedAccount(req.user!.id, 'facebook');
      if (account?.access_token) await sendFacebookMessage(account.access_token, row.external_chat_id, replyText);
    }

    await updateRows('customer_messages', { user_id: req.user!.id, id: req.params.id }, { status: 'replied' });

    return res.json({ success: true });
  } catch (err) {
    console.error('[messages] reply error:', err);
    return res.status(500).json({ error: 'Could not send this reply.' });
  }
});

// AI Post Generation Endpoint — topic text is optional as long as a product
// photo is attached (imageBase64, the same data: URL the Content Creator
// already keeps in mediaPreview): Gemini looks at the photo itself and
// writes the caption from what it sees, using any topic text as extra
// context (price, promo, delivery terms) rather than the sole source.
// requireAuth so an unauthenticated caller can't spend the account's Gemini
// quota for free — this endpoint makes a real API call per request.
app.post('/api/ai/generate-post', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { topic, tone, platforms, businessType, imageBase64 } = req.body;
    const apiKey = await resolveGeminiApiKey(req.user!.id);
    const hasTopic = !!(topic && String(topic).trim());

    const imageMatch = typeof imageBase64 === 'string' ? /^data:([^;]+);base64,(.+)$/.exec(imageBase64) : null;
    const imagePart = imageMatch ? { inlineData: { mimeType: imageMatch[1], data: imageMatch[2] } } : null;

    if (!apiKey) {
      // High-quality fallback if API key is not configured
      return res.json({
        title: `✨ ${hasTopic ? topic : 'Special Promotion'}`,
        myanmarContent: `ချစ်စရာကောင်းတဲ့ customer များအတွက် ${hasTopic ? topic : 'အထူးပရိုမိုးရှင်း'} အစီအစဉ်လေး စတင်ပါပြီရှင်။ လက်လွတ်မခံဘဲ အခုပဲ page messenger ကနေ order တင်လိုက်ပါနော်။ KPay / WavePay ဖြင့် အဆင်ပြေစွာ ပေးချေနိုင်ပါသည်။ 💖`,
        content: `Exciting announcement for our beloved customers regarding ${hasTopic ? topic : 'special updates'}! Premium quality guaranteed with fast delivery. Message us now to place your order!`,
        tags: ['#PinkkuMM', '#MyanmarBusiness', '#ShopOnlineYangon', '#SpecialOffer'],
        tone: tone || 'Friendly & Engaging'
      });
    }

    if (!hasTopic && !imagePart) {
      return res.status(400).json({ error: 'Describe the product, or attach a photo, before generating.' });
    }

    const ai = getGemini(apiKey);
    const topicLine = hasTopic
      ? `Topic / Product: "${topic}"`
      : 'Topic / Product: not described in words — look at the attached product photo and write the post from what you actually see in it (type of item, color, style). Do not invent details the photo does not show.';
    const photoNote = imagePart && hasTopic
      ? '\nA product photo is also attached — use it to ground the visual details (color, style) of your description alongside the topic text above.'
      : '';

    const prompt = `You are a social media marketing copywriter specializing in Myanmar (Burma) e-commerce & retail.
Create an engaging promotional post for a business of type "${businessType || 'General Retail'}".
${topicLine}${photoNote}
Tone: "${tone || 'Excited & Friendly'}"
Target Platforms: ${(platforms || ['Facebook', 'Instagram', 'TikTok', 'Telegram']).join(', ')}

Please output a valid JSON object with the following fields:
- "title": A catchy headline with emoji
- "myanmarContent": Complete, natural, polite, and persuasive Burmese text (Unicode) suitable for Myanmar Facebook/TikTok shoppers (including calls to action like KPay, delivery info, and polite ending particles like ရှင်/ခင်ဗျာ).
- "content": Clean English translation/version of the post.
- "tags": Array of 4-6 relevant hashtags (mix of English and Myanmar).
- "tone": String describing the tone used.

Output strictly valid JSON only.`;

    const response = await generateContentWithRetry(ai, {
      model: 'gemini-flash-lite-latest',
      contents: imagePart ? [{ role: 'user', parts: [{ text: prompt }, imagePart] }] : prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text;
    const parsed = JSON.parse(responseText);
    return res.json(parsed);
  } catch (error: any) {
    console.error('Gemini post generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate post with AI',
      details: error?.message
    });
  }
});

// AI Customer Reply Endpoint
interface GenerateReplyParams {
  customerMessage: string;
  customerName?: string;
  platform?: string;
  businessName?: string;
  senderName?: string;
  userId?: string;
}

// Shared by the manual "AI Drafted Response" endpoint and the Telegram
// auto-reply poller, so both produce the exact same kind of reply.
async function generateAIReply(params: GenerateReplyParams): Promise<any> {
  const { customerMessage, customerName, platform, businessName, senderName, userId } = params;
  const apiKey = await resolveGeminiApiKey(userId);
  const signOffName = senderName || businessName || 'Pinkku';
  const isEmail = (platform || '').toLowerCase() === 'gmail';

  // Gmail inbox mail isn't always a sales inquiry (security alerts, event
  // reminders, job postings, etc.), so its fallback stays a neutral
  // acknowledgment rather than assuming stock/delivery like the Telegram
  // customer-chat fallback below, which is written for a shop's DMs.
  const fallbackReply = () => (isEmail ? {
    suggestedReplyMyanmar: `မင်္ဂလာပါရှင် ${customerName || 'customer'} ရှင့်။ ဒီအီးမေးလ်ကို လက်ခံရရှိပါပြီရှင်။ အသေးစိတ်ကို ဖတ်ရှုပြီး မကြာမီ ပြန်လည်ဆက်သွယ်ပါ့မယ်ရှင်။`,
    suggestedReplyEnglish: `Dear ${customerName || 'Valued Customer'},\n\nThank you for your email. I've received it and will follow up with a detailed response shortly.\n\nBest regards,\n${signOffName}`,
  } : {
    suggestedReplyMyanmar: `မင်္ဂလာပါရှင် ${customerName || 'customer'} ရှင့်။ မေးမြန်းပေးတဲ့အတွက် ကျေးဇူးတင်ပါတယ်ရှင်။ ပစ္စည်း ready stock ရှိပြီး ရန်ကုန်မြို့တွင်းဆိုရင် (၁-၂) ရက်အတွင်း အိမ်အရောက် ပို့ဆောင်ပေးပါတယ်ရှင်။ မှာယူလိုပါက အမည်၊ ဖုန်းနံပါတ်နှင့် လိပ်စာလေး ပေးပို့ပေးပါနော်။`,
    suggestedReplyEnglish: `Hello ${customerName || 'Customer'}! Thank you for reaching out. The item is in stock and we can deliver within 1-2 days. Please provide your name, phone number and delivery address to confirm the order.`,
  });

  if (!apiKey) {
    return fallbackReply();
  }

  const ai = getGemini(apiKey);
  const prompt = isEmail
    ? `You are writing a professional business email reply on behalf of "${signOffName}" at "${businessName || 'Pinkku'}".
Recipient Name: ${customerName || 'Valued Customer'}
Original Email: "${customerMessage}"

Write a formal English business email reply:
- Start with "Dear ${customerName || 'Valued Customer'},"
- Respond directly to the substance of their email — no generic filler greetings like "warm welcome" or "welcome to our workspace".
- Close with a professional sign-off (e.g. "Best regards," or "Kind regards,") followed by "${signOffName}" on its own line.

Return a valid JSON object with:
- "suggestedReplyEnglish": The full formal email reply as described above.
- "suggestedReplyMyanmar": A polite Burmese version of the same reply, adapted naturally rather than translated word-for-word.
- "sentiment": Sentiment of the sender (positive, question, urgent, neutral).
- "orderIntent": boolean (true if the email is asking about buying, stock, or price).

Output strictly valid JSON only.`
    : `You are a polite, helpful customer service representative for a Myanmar business named "${businessName || 'Pinkku'}".
Customer Name: ${customerName || 'Valued Customer'}
Customer Platform: ${platform || 'Facebook Messenger'}
Customer Inquiry: "${customerMessage}"

Generate a helpful, polite, natural customer support reply that responds directly to what the customer actually asked or said.

Hard rule: never welcome the customer to the business/workspace, in any wording. Banned openers include (in any language or phrasing) "welcome to [business]", "[business] ကနေ ... ကြိုဆိုပါတယ်", "လှိုက်လှဲစွာ ကြိုဆိုပါတယ်", "နွေးထွေးစွာ ကြိုဆိုပါတယ်", or any sentence whose main point is greeting/welcoming rather than answering. The reply must start by engaging with the customer's actual message.
Example — customer asks "ဘာတွေရောင်းလဲ" (what do you sell):
- BAD: "မင်္ဂလာပါရှင်။ [Business] ကနေ လှိုက်လှဲစွာ ကြိုဆိုပါတယ်။ ဘာတွေရောင်းလဲဆိုတာ မေးမြန်းပေးတဲ့အတွက် ကျေးဇူးတင်ပါတယ်..."
- GOOD: "မင်္ဂလာပါရှင်။ ကျွန်မတို့ဆီမှာ [specific products/services] တွေ ရောင်းချပေးနေပါတယ်ရှင်..."
A short greeting word (မင်္ဂလာပါရှင်/ခင်ဗျာ) is fine, but it must be immediately followed by the actual answer, not a welcome statement.

Return a valid JSON object with:
- "suggestedReplyMyanmar": Ultra-polite Burmese text in natural spoken Unicode tone, following the hard rule above.
- "suggestedReplyEnglish": Clear English translation.
- "sentiment": Sentiment of customer (positive, question, urgent, neutral).
- "orderIntent": boolean (true if customer is asking about buying, stock, or price).

Output strictly valid JSON only.`;

  let response: Awaited<ReturnType<typeof generateContentWithRetry>>;
  try {
    response = await generateContentWithRetry(ai, {
      model: 'gemini-flash-lite-latest',
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
  } catch (err) {
    console.error('[ai] generateAIReply failed after retries, using fallback reply:', err);
    return fallbackReply();
  }

  const parsed = JSON.parse(response.text);
  if (!isEmail) {
    // The model still slips into a "welcome to [business]" opener often
    // enough that prompt instructions alone aren't reliable — strip it
    // deterministically as a safety net.
    parsed.suggestedReplyMyanmar = stripWelcomeOpener(parsed.suggestedReplyMyanmar);
    parsed.suggestedReplyEnglish = stripWelcomeOpener(parsed.suggestedReplyEnglish);
  }
  return parsed;
}

function stripWelcomeOpener(text: string | undefined): string | undefined {
  if (!text) return text;
  const sentences = text.split(/(?<=[။.!?])\s+/);
  while (sentences.length > 1 && /ကြိုဆို|welcome to\b/i.test(sentences[0])) {
    sentences.shift();
  }
  return sentences.join(' ').trim();
}

// requireAuth here isn't just access control — this endpoint spends a real
// Gemini API call per request, so leaving it open let anyone who found the
// URL burn through the account's quota for free. It also lets the handler
// check the caller's own FAQ list before spending that call at all.
app.post('/api/ai/generate-reply', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const faqMatch = req.body?.customerMessage ? await findFaqMatch(req.user!.id, req.body.customerMessage) : null;
    if (faqMatch) {
      return res.json({
        suggestedReplyMyanmar: faqMatch.answer,
        suggestedReplyEnglish: faqMatch.answer,
        sentiment: 'neutral',
        orderIntent: false,
        source: 'faq',
      });
    }
    const parsed = await generateAIReply({ ...req.body, userId: req.user!.id });
    return res.json(parsed);
  } catch (error: any) {
    console.error('Gemini reply generation error:', error);
    return res.status(500).json({
      error: 'Failed to generate reply',
      details: error?.message
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve the built frontend ourselves only for local `npm start`. On Vercel,
// the static build is deployed and served directly — this app only ever
// receives the /api/* requests routed to it, so this block would just be
// dead weight (and its catch-all `app.get('*', ...)` would wrongly try to
// swallow unmatched /api routes too).
if (!process.env.VERCEL) {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

export default app;
