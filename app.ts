import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { Resend } from 'resend';
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
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

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Database (Supabase/Postgres — schema lives in supabase_schema.sql, run once
// via the Supabase SQL Editor; this client just talks to it over HTTPS)
// ---------------------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env');
}
const db = createClient(supabaseUrl, supabaseKey);

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
  const { data, error } = await db.from('users').select('*').eq('email', email).maybeSingle();
  if (error) throw error;
  return (data as UserRow) || undefined;
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
  const { data, error } = await db.from('users').insert({
    id: row.id,
    name: row.name,
    email: row.email,
    password_hash: row.passwordHash,
    business_name: row.businessName,
    business_type: row.businessType,
    avatar: row.avatar,
    tier: row.tier,
    created_at: createdAt,
  }).select().single();
  if (error) throw error;
  return data as UserRow;
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
async function createSession(userId: string): Promise<string> {
  const token = 'sess_' + randomUUID();
  const { error } = await db.from('sessions').insert({ token, user_id: userId, created_at: new Date().toISOString() });
  if (error) throw error;
  return token;
}

async function getUserBySessionToken(token: string): Promise<UserRow | undefined> {
  const { data: session } = await db.from('sessions').select('user_id').eq('token', token).maybeSingle();
  if (!session) return undefined;
  const { data: user } = await db.from('users').select('*').eq('id', session.user_id).maybeSingle();
  return (user as UserRow) || undefined;
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
  const { error } = await db.from('oauth_states').insert({
    state, user_id: userId, platform, extra: extra ?? null, created_at: new Date().toISOString(),
  });
  if (error) throw error;
  return state;
}

// Looks up a state (optionally scoped to a platform) and deletes it — states are one-time use.
async function consumeOAuthState(state: string, platform?: string): Promise<{ user_id: string; extra: string | null } | undefined> {
  let query = db.from('oauth_states').select('*').eq('state', state);
  if (platform) query = query.eq('platform', platform);
  const { data } = await query.maybeSingle();
  if (!data) return undefined;
  await db.from('oauth_states').delete().eq('state', state);
  return data as { user_id: string; extra: string | null };
}

async function upsertConnectedAccount(row: Record<string, any>): Promise<void> {
  const { error } = await db.from('connected_accounts').upsert(row, { onConflict: 'user_id,platform' });
  if (error) throw error;
}

async function getConnectedAccount(userId: string, platform: string): Promise<ConnectedAccountRow | undefined> {
  const { data } = await db.from('connected_accounts').select('*').eq('user_id', userId).eq('platform', platform).maybeSingle();
  return (data as ConnectedAccountRow) || undefined;
}

async function updateConnectedAccount(userId: string, platform: string, patch: Record<string, any>): Promise<void> {
  const { error } = await db.from('connected_accounts').update(patch).eq('user_id', userId).eq('platform', platform);
  if (error) throw error;
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
function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set in environment.");
    }
    geminiClient = new GoogleGenAI({ apiKey: apiKey || '' });
  }
  return geminiClient;
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
app.post('/api/auth/register', async (req, res) => {
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

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  const normalizedEmail = String(email).toLowerCase().trim();
  const existing = await findUserByEmail(normalizedEmail);

  if (!existing) {
    return res.status(401).json({ error: 'No account found with this email. Please sign up first.' });
  }
  if (!existing.password_hash || !verifyPassword(password, existing.password_hash)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  return res.json({
    token: await createSession(existing.id),
    user: toPublicUser(existing),
    isNewUser: false,
  });
});

// Google Authentication endpoint
app.post('/api/auth/google', async (req, res) => {
  const { googleEmail, googleName, googleAvatar, businessName } = req.body;
  if (!googleEmail || !String(googleEmail).trim()) {
    return res.status(400).json({ error: 'Google email is required.' });
  }

  const normalizedEmail = String(googleEmail).toLowerCase().trim();
  const existing = await findUserByEmail(normalizedEmail);

  if (existing) {
    return res.json({
      token: await createSession(existing.id),
      user: toPublicUser(existing),
      isNewUser: false,
    });
  }

  const cleanPrefix = normalizedEmail.split('@')[0] || 'user';
  const derivedName = (googleName && String(googleName).trim()) || (cleanPrefix.charAt(0).toUpperCase() + cleanPrefix.slice(1));
  const avatar = googleAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(derivedName)}&background=4285F4&color=fff`;

  const row = await insertUser({
    id: 'usr_g_' + randomUUID(),
    name: derivedName,
    email: normalizedEmail,
    passwordHash: null,
    businessName: (businessName && String(businessName).trim()) || `${derivedName}'s Workspace`,
    businessType: 'Social Media & Retail',
    avatar,
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

app.post('/api/auth/logout', requireAuth, async (req: AuthedRequest, res) => {
  const token = (req.headers.authorization || '').slice(7);
  await db.from('sessions').delete().eq('token', token);
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
      const { data: existing } = await db.from('connected_accounts')
        .select('refresh_token').eq('user_id', stateRow.user_id).eq('platform', 'gmail').maybeSingle();
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
      `https://graph.facebook.com/${FACEBOOK_API_VERSION}/me/accounts?access_token=${encodeURIComponent(userAccessToken)}`
    );
    const pagesData: any = await pagesRes.json();
    if (!pagesRes.ok || pagesData.error) {
      console.error('[oauth] Facebook pages fetch failed:', pagesData);
      return res.redirect('/?connect_error=no_pages');
    }
    const page = (pagesData.data || [])[0];
    if (!page) {
      return res.redirect('/?connect_error=no_pages');
    }

    await upsertConnectedAccount({
      user_id: stateRow.user_id,
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

    // 4) Instagram Business accounts connect through the same Facebook Page —
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
          user_id: stateRow.user_id,
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

    return res.redirect('/?connected=facebook');
  } catch (err) {
    console.error('[oauth] Facebook callback error:', err);
    return res.redirect('/?connect_error=server_error');
  }
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
app.post('/api/tiktok/content-tips', requireAuth, async (req, res) => {
  const { topic, businessType } = req.body;
  if (!topic || !String(topic).trim()) {
    return res.status(400).json({ error: 'topic is required.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
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
    const ai = getGemini();
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
  const { error } = await db.from('oauth_states').insert({
    state: code, user_id: req.user!.id, platform: 'telegram', created_at: new Date().toISOString(),
  });
  if (error) throw error;

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
  const { data, error } = await db.from('users').select('telegram_auto_reply').eq('id', req.user!.id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not load this setting.' });
  return res.json({ enabled: !!data?.telegram_auto_reply });
});

app.patch('/api/settings/telegram-auto-reply', requireAuth, async (req: AuthedRequest, res) => {
  const { enabled } = req.body;
  const { error } = await db.from('users').update({ telegram_auto_reply: !!enabled }).eq('id', req.user!.id);
  if (error) return res.status(500).json({ error: 'Could not save this setting.' });
  return res.json({ success: true, enabled: !!enabled });
});

// Same idea, for incoming Facebook Messenger DMs to a connected Page.
app.get('/api/settings/facebook-auto-reply', requireAuth, async (req: AuthedRequest, res) => {
  const { data, error } = await db.from('users').select('facebook_auto_reply').eq('id', req.user!.id).maybeSingle();
  if (error) return res.status(500).json({ error: 'Could not load this setting.' });
  return res.json({ enabled: !!data?.facebook_auto_reply });
});

app.patch('/api/settings/facebook-auto-reply', requireAuth, async (req: AuthedRequest, res) => {
  const { enabled } = req.body;
  const { error } = await db.from('users').update({ facebook_auto_reply: !!enabled }).eq('id', req.user!.id);
  if (error) return res.status(500).json({ error: 'Could not save this setting.' });
  return res.json({ success: true, enabled: !!enabled });
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
async function detectEventInMessage(text: string, fromName: string): Promise<{
  eventDetected: boolean; eventTitle?: string; eventDate?: string; eventTime?: string | null; importance?: string;
} | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const ai = getGemini();
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
      const { data: owner } = await db.from('users').select('id').eq('id', ownerUserId).maybeSingle();
      if (!owner) return;

      if (isGroupChat) {
        // A group (e.g. a class or project chat) — feeds AI Smart Schedule
        // only, never Customer DMs or auto-reply.
        await db.from('telegram_groups').upsert({
          chat_id: chatId, owner_user_id: ownerUserId, group_name: msg.chat.title || null, created_at: new Date().toISOString(),
        });
        await sendTelegramMessage(botToken, msg.chat.id, "📌 This group is now linked to Pinkku! I'll scan messages here for tasks, deadlines and events and add them to your AI Smart Schedule.");
      } else {
        await db.from('telegram_contacts').upsert({
          chat_id: chatId, owner_user_id: ownerUserId, customer_name: customerName, created_at: new Date().toISOString(),
        });
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
    const { data: group } = await db.from('telegram_groups').select('owner_user_id').eq('chat_id', chatId).maybeSingle();
    if (!group) return;

    const detected = await detectEventInMessage(text, customerName);
    if (detected?.eventDetected && detected.eventDate) {
      await db.from('schedule_events').insert({
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
  const { data: contact } = await db.from('telegram_contacts').select('owner_user_id, customer_name').eq('chat_id', chatId).maybeSingle();
  if (!contact) return;

  const { data: owner } = await db.from('users').select('business_name, telegram_auto_reply').eq('id', contact.owner_user_id).maybeSingle();
  const finalCustomerName = contact.customer_name || customerName;
  let status = 'unread';
  let replyText: string | null = null;

  if (owner?.telegram_auto_reply) {
    try {
      const reply = await generateAIReply({
        customerMessage: text,
        customerName: finalCustomerName,
        platform: 'telegram',
        businessName: owner.business_name,
      });
      replyText = reply.suggestedReplyMyanmar || reply.suggestedReplyEnglish || null;
      if (replyText) {
        await sendTelegramMessage(botToken, msg.chat.id, replyText);
        status = 'replied';
      }
    } catch (err) {
      console.error('[telegram] auto-reply generation failed:', err);
    }
  }

  await db.from('customer_messages').insert({
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

  const detected = await detectEventInMessage(text, finalCustomerName);
  if (detected?.eventDetected && detected.eventDate) {
    await db.from('schedule_events').insert({
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

    const { data: account } = await db.from('connected_accounts')
      .select('user_id, access_token')
      .eq('platform', 'facebook')
      .eq('external_id', pageId)
      .maybeSingle();
    if (!account) continue;

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

    const { data: owner } = await db.from('users').select('business_name, facebook_auto_reply').eq('id', account.user_id).maybeSingle();
    let status = 'unread';
    let replyText: string | null = null;

    if (owner?.facebook_auto_reply) {
      try {
        const reply = await generateAIReply({
          customerMessage: text,
          customerName,
          platform: 'facebook',
          businessName: owner.business_name,
        });
        replyText = reply.suggestedReplyMyanmar || reply.suggestedReplyEnglish || null;
        if (replyText) {
          await sendFacebookMessage(account.access_token, senderId, replyText);
          status = 'replied';
        }
      } catch (err) {
        console.error('[facebook] auto-reply generation failed:', err);
      }
    }

    await db.from('customer_messages').insert({
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

    const detected = await detectEventInMessage(text, customerName);
    if (detected?.eventDetected && detected.eventDate) {
      await db.from('schedule_events').insert({
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
  const { data: rows, error } = await db.from('connected_accounts')
    .select('platform, account_email, account_name, avatar, connected_at')
    .eq('user_id', req.user!.id);
  if (error) throw error;

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
  await db.from('connected_accounts').delete().eq('user_id', req.user!.id).eq('platform', req.params.platform);
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

  const apiKey = process.env.GEMINI_API_KEY;
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
    const ai = getGemini();
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

  const apiKey = process.env.GEMINI_API_KEY;
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

    const ai = getGemini();
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
    const { data, error } = await db.from('schedule_events').select('*').eq('user_id', req.user!.id);
    if (error) throw error;
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
    const { error } = await db.from('schedule_events').upsert({
      id: eventId,
      user_id: req.user!.id,
      title,
      date,
      time: time || null,
      importance: importance || 'normal',
      source_subject: sourceSubject || null,
      manual: !!manual,
      created_at: new Date().toISOString(),
    }, { onConflict: 'user_id,id' });
    if (error) throw error;
    return res.json({ success: true, id: eventId });
  } catch (err) {
    console.error('[schedule] save error:', err);
    return res.status(500).json({ error: 'Could not save this event to your schedule.' });
  }
});

app.delete('/api/schedule/events/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    await db.from('schedule_events').delete().eq('user_id', req.user!.id).eq('id', req.params.id);
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
    createdAt: r.created_at,
  };
}

app.get('/api/posts', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { data, error } = await db.from('posts').select('*').eq('user_id', req.user!.id).order('created_at', { ascending: false });
    if (error) throw error;
    return res.json({ posts: (data || []).map(toPostResponse) });
  } catch (err) {
    console.error('[posts] list error:', err);
    return res.status(500).json({ error: 'Could not load your posts.' });
  }
});

app.post('/api/posts', requireAuth, async (req: AuthedRequest, res) => {
  const { title, content, myanmarContent, platforms, status, tone, tags } = req.body;
  if (!title || !String(title).trim()) return res.status(400).json({ error: 'title is required.' });
  if (!Array.isArray(platforms) || platforms.length === 0) return res.status(400).json({ error: 'At least one platform is required.' });

  const id = 'post_' + randomUUID();
  const now = new Date().toISOString();
  try {
    const { error } = await db.from('posts').insert({
      id,
      user_id: req.user!.id,
      title,
      content: content || '',
      myanmar_content: myanmarContent || null,
      platforms: JSON.stringify(platforms),
      status: status === 'pending_review' ? 'pending_review' : 'draft',
      tone: tone || null,
      tags: tags ? JSON.stringify(tags) : null,
      created_at: now,
      updated_at: now,
    });
    if (error) throw error;
    return res.json({ success: true, id });
  } catch (err) {
    console.error('[posts] create error:', err);
    return res.status(500).json({ error: 'Could not save this post.' });
  }
});

app.patch('/api/posts/:id', requireAuth, async (req: AuthedRequest, res) => {
  const { title, content, myanmarContent, status, scheduledDate, scheduledTime } = req.body;
  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (title !== undefined) patch.title = title;
  if (content !== undefined) patch.content = content;
  if (myanmarContent !== undefined) patch.myanmar_content = myanmarContent;
  if (status !== undefined) patch.status = status;
  if (scheduledDate !== undefined) patch.scheduled_date = scheduledDate;
  if (scheduledTime !== undefined) patch.scheduled_time = scheduledTime;

  try {
    const { error } = await db.from('posts').update(patch).eq('user_id', req.user!.id).eq('id', req.params.id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (err) {
    console.error('[posts] update error:', err);
    return res.status(500).json({ error: 'Could not update this post.' });
  }
});

app.delete('/api/posts/:id', requireAuth, async (req: AuthedRequest, res) => {
  try {
    await db.from('posts').delete().eq('user_id', req.user!.id).eq('id', req.params.id);
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
    const { data, error } = await db.from('customer_messages').select('*').eq('user_id', req.user!.id).order('created_at', { ascending: false });
    if (error) throw error;
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
    const { data: row, error: fetchError } = await db.from('customer_messages').select('*').eq('user_id', req.user!.id).eq('id', req.params.id).maybeSingle();
    if (fetchError) throw fetchError;
    if (!row) return res.status(404).json({ error: 'Message not found.' });

    if (row.platform === 'telegram' && row.external_chat_id) {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (botToken) await sendTelegramMessage(botToken, row.external_chat_id, replyText);
    }

    if (row.platform === 'facebook' && row.external_chat_id) {
      const account = await getConnectedAccount(req.user!.id, 'facebook');
      if (account?.access_token) await sendFacebookMessage(account.access_token, row.external_chat_id, replyText);
    }

    const { error: updateError } = await db.from('customer_messages').update({ status: 'replied' }).eq('user_id', req.user!.id).eq('id', req.params.id);
    if (updateError) throw updateError;

    return res.json({ success: true });
  } catch (err) {
    console.error('[messages] reply error:', err);
    return res.status(500).json({ error: 'Could not send this reply.' });
  }
});

// AI Post Generation Endpoint
app.post('/api/ai/generate-post', async (req, res) => {
  try {
    const { topic, tone, platforms, businessType, language } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      // High-quality fallback if API key is not configured
      return res.json({
        title: `✨ ${topic || 'Special Promotion'}`,
        myanmarContent: `ချစ်စရာကောင်းတဲ့ customer များအတွက် ${topic || 'အထူးပရိုမိုးရှင်း'} အစီအစဉ်လေး စတင်ပါပြီရှင်။ လက်လွတ်မခံဘဲ အခုပဲ page messenger ကနေ order တင်လိုက်ပါနော်။ KPay / WavePay ဖြင့် အဆင်ပြေစွာ ပေးချေနိုင်ပါသည်။ 💖`,
        content: `Exciting announcement for our beloved customers regarding ${topic || 'special updates'}! Premium quality guaranteed with fast delivery. Message us now to place your order!`,
        tags: ['#PinkkuMM', '#MyanmarBusiness', '#ShopOnlineYangon', '#SpecialOffer'],
        tone: tone || 'Friendly & Engaging'
      });
    }

    const ai = getGemini();
    const prompt = `You are a social media marketing copywriter specializing in Myanmar (Burma) e-commerce & retail.
Create an engaging promotional post for a business of type "${businessType || 'General Retail'}".
Topic / Product: "${topic}"
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
      contents: prompt,
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
}

// Shared by the manual "AI Drafted Response" endpoint and the Telegram
// auto-reply poller, so both produce the exact same kind of reply.
async function generateAIReply(params: GenerateReplyParams): Promise<any> {
  const { customerMessage, customerName, platform, businessName, senderName } = params;
  const apiKey = process.env.GEMINI_API_KEY;
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

  const ai = getGemini();
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

app.post('/api/ai/generate-reply', async (req, res) => {
  try {
    const parsed = await generateAIReply(req.body);
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
